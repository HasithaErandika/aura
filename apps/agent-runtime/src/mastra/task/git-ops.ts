import type { BridgeCaller } from '../bridge/client';

// The git side of a Task (plan §8), run by code through the bridge (the developer's permission
// rules still apply): the Task branch after Gate 4, a worktree per parallel part on its own
// `_s<N>` sub-branch, a commit per part, and the merge back into the Task branch.

const WORKTREES = '.aura/worktrees';
// A GitHub login or org/team.
export const REVIEWER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(\/[A-Za-z0-9_.-]+)?$/;
const REF = /^[\w./-]+$/;

export class GitStepError extends Error {
  constructor(
    readonly command: string,
    readonly output: string,
  ) {
    super(`\`${command}\` failed: ${output.trim().slice(0, 500) || 'no output'}`);
    this.name = 'GitStepError';
  }
}

function ref(name: string): string {
  if (!REF.test(name) || name.includes('..')) throw new Error(`invalid git ref ${name}`);
  return name;
}

// Text that goes inside a double-quoted shell argument: plain words only.
export function shellSafe(text: string): string {
  return text.replace(/[^\w .,:()#/+-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function commitMessage(text: string): string {
  return shellSafe(text) || 'AURA change';
}

export interface Git {
  run(command: string, cwd?: string): Promise<{ exitCode: number; output: string }>;
  ok(command: string, cwd?: string): Promise<string>;
}

export function gitOn(bridge: BridgeCaller): Git {
  const run = async (command: string, cwd?: string) => {
    const r = await bridge.call('sandbox.exec', { command, timeoutMs: 120_000, ...(cwd ? { cwd } : {}) }, 125_000);
    return { exitCode: r.timedOut ? 124 : r.exitCode, output: `${r.stdout}${r.stderr ? `\n${r.stderr}` : ''}`.trim() };
  };
  return {
    run,
    async ok(command, cwd) {
      const r = await run(command, cwd);
      if (r.exitCode !== 0) throw new GitStepError(command, r.output);
      return r.output;
    },
  };
}

// On the Task branch, ready to work: stays if already there; otherwise checks it out, or creates
// it from `development` (else the current commit). Switching needs a clean working tree, so the
// developer's own uncommitted work is never carried or lost. Returns the commit to compare with.
export async function ensureTaskBranch(git: Git, branch: string): Promise<{ base: string; created: boolean }> {
  const current = (await git.ok('git rev-parse --abbrev-ref HEAD')).trim();
  let created = false;
  if (current !== ref(branch)) {
    const dirty = (await git.ok('git status --porcelain')).trim();
    if (dirty) throw new Error(`Your working tree has uncommitted changes on ${current}. Commit or stash them, then ask AURA to continue: the Task works on ${branch}.`);
    const exists = (await git.run(`git rev-parse --verify --quiet refs/heads/${branch}`)).exitCode === 0;
    if (exists) await git.ok(`git checkout ${branch}`);
    else {
      const from = (await git.run('git rev-parse --verify --quiet refs/heads/development')).exitCode === 0 ? 'development' : 'HEAD';
      await git.ok(`git checkout -b ${branch} ${from}`);
      created = true;
    }
  }
  return { base: (await git.ok('git rev-parse HEAD')).trim(), created };
}

export function worktreePath(name: string): string {
  return `${WORKTREES}/${ref(name)}`;
}

// A fresh worktree for a part, on its sub-branch from `from`. node_modules is linked from the main
// folder so the checks can run there (best effort; it is never committed).
export async function addWorktree(git: Git, bridge: BridgeCaller, name: string, branch: string, from: string): Promise<void> {
  await bridge.call('fs.mkdir', { path: WORKTREES, recursive: true });
  await bridge.call('fs.writeFile', { path: `${WORKTREES}/.gitignore`, content: '*\n', overwrite: true });
  await git.run(`git worktree remove --force ${worktreePath(name)}`);
  await git.ok(`git worktree add -B ${ref(branch)} ${worktreePath(name)} ${ref(from)}`);
  const hasModules = await bridge.call('fs.exists', { path: 'node_modules' }).then((r) => r.exists).catch(() => false);
  if (hasModules) await git.run('ln -s ../../../node_modules node_modules', worktreePath(name)).catch(() => undefined);
}

// Commits everything the part changed in its worktree. False when it changed nothing.
export async function commitWorktree(git: Git, name: string, message: string): Promise<boolean> {
  const cwd = worktreePath(name);
  await git.ok('git add -A -- . ":(exclude)node_modules"', cwd);
  if ((await git.run('git diff --cached --quiet', cwd)).exitCode === 0) return false;
  await git.ok(`git commit -m "${commitMessage(message)}"`, cwd);
  return true;
}

export type MergeResult = { clean: true } | { clean: false; conflicts: string[] };

// Merges a part's sub-branch into the current (Task) branch. A conflict leaves the merge open
// with the conflicting files listed; anything else that fails aborts it and throws.
export async function mergeBranch(git: Git, branch: string, message: string): Promise<MergeResult> {
  const r = await git.run(`git merge --no-ff -m "${commitMessage(message)}" ${ref(branch)}`);
  if (r.exitCode === 0) return { clean: true };
  const conflicts = (await git.ok('git diff --name-only --diff-filter=U')).split('\n').map((l) => l.trim()).filter(Boolean);
  if (!conflicts.length) {
    await git.run('git merge --abort');
    throw new GitStepError(`git merge ${branch}`, r.output);
  }
  return { clean: false, conflicts };
}

export async function concludeMerge(git: Git, files: string[]): Promise<void> {
  for (const f of files) await git.ok(`git add -- "${f.replace(/["$`\\]/g, '')}"`);
  await git.ok('git commit --no-edit');
}

export async function abortMerge(git: Git): Promise<void> {
  await git.run('git merge --abort');
}

// After a part is merged: its worktree and sub-branch go (plan §8).
export async function removeWorktree(git: Git, name: string, branch: string): Promise<void> {
  await git.run(`git worktree remove --force ${worktreePath(name)}`);
  await git.run(`git branch -d ${ref(branch)}`);
}

export const CONFLICT_MARKER = /^(<{7}|>{7}|={7})( |$)/m;

// ── Gate 6 ────────────────────────────────────────────────────────────────────────────────────

export async function currentBranch(git: Git): Promise<string> {
  return (await git.ok('git rev-parse --abbrev-ref HEAD')).trim();
}

// Commits everything left in the working tree (the change accepted at Gate 5). The project's
// beforeCommit hooks run in the extension first. False when there was nothing to commit.
export async function commitAll(git: Git, message: string): Promise<boolean> {
  await git.ok('git add -A');
  if ((await git.run('git diff --cached --quiet')).exitCode === 0) return false;
  await git.ok(`git commit -m "${commitMessage(message)}"`);
  return true;
}

export async function headSha(git: Git): Promise<string> {
  return (await git.ok('git rev-parse HEAD')).trim();
}

export async function pushBranch(git: Git, branch: string): Promise<void> {
  await git.ok(`git push -u origin ${ref(branch)}`);
}

export async function originUrl(git: Git): Promise<string | null> {
  const r = await git.run('git remote get-url origin');
  return r.exitCode === 0 ? r.output.split('\n')[0]!.trim() : null;
}

// Opens the PR with the developer's own GitHub CLI. Null when gh is missing or not signed in, so
// the caller can fall back to a compare link. An existing PR for the branch is returned as is.
export async function ghPrCreate(git: Git, bridge: BridgeCaller, input: { branch: string; base: string; title: string; body: string; reviewers: string[]; taskKey: string }): Promise<{ output: string; exitCode: number } | null> {
  if ((await git.run('gh --version')).exitCode !== 0) return null;
  if ((await git.run('gh auth status')).exitCode !== 0) return null;
  const dir = '.aura/tmp';
  const file = `${dir}/pr-${ref(input.taskKey)}.md`;
  await bridge.call('fs.mkdir', { path: dir, recursive: true });
  await bridge.call('fs.writeFile', { path: `${dir}/.gitignore`, content: '*\n', overwrite: true });
  await bridge.call('fs.writeFile', { path: file, content: input.body, overwrite: true });
  try {
    const reviewers = input.reviewers.filter((r) => REVIEWER.test(r)).map((r) => ` --reviewer ${r}`).join('');
    return await git.run(`gh pr create --base ${ref(input.base)} --head ${ref(input.branch)} --title "${commitMessage(input.title)}" --body-file ${file}${reviewers}`);
  } finally {
    await bridge.call('fs.deleteFile', { path: file, force: true }).catch(() => undefined);
  }
}
