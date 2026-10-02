import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// After a person merges the Task's PR: the parallel parts' leftover worktrees and `_s<N>` branches
// go. Only safe git commands are used: `worktree remove` without --force keeps a worktree with
// changes, and `branch -d` keeps a branch that is not merged.

interface Worktree {
  path: string;
  branch: string | null;
}

export function parseWorktrees(porcelain: string): Worktree[] {
  return porcelain
    .split(/\n\n+/)
    .map((block) => {
      const path = /^worktree (.+)$/m.exec(block)?.[1] ?? null;
      const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null;
      return path ? { path, branch } : null;
    })
    .filter((w): w is Worktree => w !== null);
}

const partOf = (taskBranch: string) => new RegExp(`^${taskBranch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_s\\d+$`);

export function leftovers(taskBranch: string, worktrees: Worktree[], branches: string[]): { worktrees: string[]; branches: string[] } {
  const isPart = partOf(taskBranch);
  return {
    worktrees: worktrees.filter((w) => w.branch !== null && isPart.test(w.branch) && /[\\/]\.aura[\\/]worktrees[\\/]/.test(w.path)).map((w) => w.path),
    branches: branches.filter((b) => isPart.test(b)),
  };
}

export async function cleanupMergedTask(root: string, taskBranch: string): Promise<{ worktrees: number; branches: number; kept: string[] }> {
  const git = async (...args: string[]) => (await run("git", args, { cwd: root })).stdout;
  const found = leftovers(
    taskBranch,
    parseWorktrees(await git("worktree", "list", "--porcelain")),
    (await git("for-each-ref", "--format=%(refname:short)", "refs/heads/")).split("\n").filter(Boolean),
  );
  const kept: string[] = [];
  let worktrees = 0;
  let branches = 0;
  for (const path of found.worktrees) {
    await git("worktree", "remove", path).then(() => (worktrees += 1), () => kept.push(path));
  }
  await git("worktree", "prune").catch(() => undefined);
  for (const branch of found.branches) {
    await git("branch", "-d", branch).then(() => (branches += 1), () => kept.push(branch));
  }
  return { worktrees, branches, kept };
}
