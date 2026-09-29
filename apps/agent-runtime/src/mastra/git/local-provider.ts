import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  assertValidBranch,
  assertValidRepoRef,
  GitProviderError,
  type BranchRef,
  type CheckRun,
  type CreateCheckRunInput,
  type GitProvider,
  type MergeState,
  type OpenPullRequestInput,
  type PullRequest,
  type RepoRef,
  type UpdateCheckRunInput,
} from './provider';

const execFileAsync = promisify(execFile);

// The `local` GitProvider: each registered repository is a bare repo at
// <root>/<owner>/<name>.git. Branches and pushes are real git. Pull requests and check runs,
// which plain git doesn't have, live in <repo>.git/aura-host.json. A PR's state comes from git
// itself: merged once its head commit is reachable from its base branch, so merging stays a human
// `git merge` + `git push`, the same as merging on GitHub. For tests, offline work and AURA_MODE=local.

interface StoredPull {
  number: number;
  title: string;
  body: string;
  head: string;
  base: string;
  closed: boolean;
  // Last head commit seen, so a merged PR keeps its sha after the branch is deleted.
  lastHeadSha: string;
}

interface HostState {
  nextPull: number;
  pulls: StoredPull[];
  nextCheck: number;
  checks: CheckRun[];
}

const SHA = /^[0-9a-f]{40}$/;

export class LocalGitProvider implements GitProvider {
  readonly kind = 'local' as const;
  private readonly root: string;
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  repoDir(repo: RepoRef): string {
    assertValidRepoRef(repo);
    const dir = path.resolve(this.root, repo.owner, `${repo.name}.git`);
    if (path.dirname(path.dirname(dir)) !== this.root) throw new GitProviderError('Repository path escapes the local root', 'invalid');
    return dir;
  }

  // Creates the bare repository if it doesn't exist yet. Not part of GitProvider: on GitHub the
  // repository is created by a human, and AURA only registers it.
  async ensureRepository(repo: RepoRef): Promise<string> {
    const dir = this.repoDir(repo);
    const exists = await this.git(dir, 'rev-parse', '--is-bare-repository').then(
      (out) => out === 'true',
      () => false,
    );
    if (!exists) {
      await mkdir(dir, { recursive: true });
      await execFileAsync('git', ['init', '--bare', '-q', '-b', repo.defaultBranch, dir]);
    }
    return dir;
  }

  async remoteUrl(repo: RepoRef): Promise<string> {
    return this.repoDir(repo);
  }

  async getBranch(repo: RepoRef, branch: string): Promise<BranchRef | null> {
    assertValidBranch(branch);
    const sha = await this.git(this.repoDir(repo), 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`).catch(() => null);
    return sha ? { name: branch, sha } : null;
  }

  async createBranch(repo: RepoRef, branch: string, fromSha?: string): Promise<BranchRef> {
    assertValidBranch(branch);
    const dir = this.repoDir(repo);
    let target = fromSha;
    if (target === undefined) {
      const base = await this.getBranch(repo, repo.defaultBranch);
      if (!base) throw new GitProviderError(`${repo.owner}/${repo.name} has no ${repo.defaultBranch} branch yet`, 'not_found');
      target = base.sha;
    } else if (!SHA.test(target) || !(await this.commitExists(dir, target))) {
      throw new GitProviderError(`Unknown commit: ${JSON.stringify(target)}`, 'not_found');
    }

    const existing = await this.getBranch(repo, branch);
    if (existing) {
      if (existing.sha === target) return existing;
      throw new GitProviderError(`Branch ${branch} already exists at ${existing.sha.slice(0, 7)}`, 'conflict');
    }
    // The empty old value makes update-ref fail if the branch appeared in the meantime.
    await this.git(dir, 'update-ref', `refs/heads/${branch}`, target, '');
    return { name: branch, sha: target };
  }

  async push(repo: RepoRef, workDir: string, branch: string): Promise<BranchRef> {
    assertValidBranch(branch);
    const url = await this.remoteUrl(repo);
    try {
      await execFileAsync('git', ['push', '--quiet', '--', url, `refs/heads/${branch}:refs/heads/${branch}`], { cwd: workDir });
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? String(error);
      const rejected = /rejected|non-fast-forward|fetch first/.test(stderr);
      throw new GitProviderError(`Push of ${branch} failed: ${stderr.trim()}`, rejected ? 'conflict' : 'upstream');
    }
    const pushed = await this.getBranch(repo, branch);
    if (!pushed) throw new GitProviderError(`Branch ${branch} missing after push`, 'upstream');
    return pushed;
  }

  async openPullRequest(repo: RepoRef, input: OpenPullRequestInput): Promise<PullRequest> {
    const base = input.base ?? repo.defaultBranch;
    assertValidBranch(input.head);
    assertValidBranch(base);
    if (input.head === base) throw new GitProviderError('Head and base are the same branch', 'invalid');
    const dir = this.repoDir(repo);
    const head = await this.getBranch(repo, input.head);
    if (!head) throw new GitProviderError(`Branch ${input.head} not found`, 'not_found');
    const baseRef = await this.getBranch(repo, base);
    if (!baseRef) throw new GitProviderError(`Branch ${base} not found`, 'not_found');
    if (await this.isAncestor(dir, head.sha, baseRef.sha)) {
      throw new GitProviderError(`No changes between ${base} and ${input.head}`, 'invalid');
    }

    return this.withState(repo, async (state) => {
      const existing = state.pulls.find((p) => !p.closed && p.head === input.head && p.base === base);
      if (existing) return this.toPull(repo, existing);
      const pull: StoredPull = { number: state.nextPull++, title: input.title, body: input.body, head: input.head, base, closed: false, lastHeadSha: head.sha };
      state.pulls.push(pull);
      return this.toPull(repo, pull);
    });
  }

  async getPullRequest(repo: RepoRef, number: number): Promise<PullRequest | null> {
    return this.withState(repo, async (state) => {
      const pull = state.pulls.find((p) => p.number === number);
      return pull ? this.toPull(repo, pull) : null;
    });
  }

  // Local-only: stands in for closing a PR on the host without merging it.
  async closePullRequest(repo: RepoRef, number: number): Promise<PullRequest> {
    return this.withState(repo, async (state) => {
      const pull = state.pulls.find((p) => p.number === number);
      if (!pull) throw new GitProviderError(`Pull request #${number} not found`, 'not_found');
      pull.closed = true;
      return this.toPull(repo, pull);
    });
  }

  async createCheckRun(repo: RepoRef, input: CreateCheckRunInput): Promise<CheckRun> {
    if (!SHA.test(input.headSha) || !(await this.commitExists(this.repoDir(repo), input.headSha))) {
      throw new GitProviderError(`Unknown commit: ${JSON.stringify(input.headSha)}`, 'not_found');
    }
    return this.withState(repo, async (state) => {
      const check: CheckRun = { id: state.nextCheck++, name: input.name, headSha: input.headSha, status: input.status ?? 'queued', conclusion: null, summary: input.summary ?? '' };
      state.checks.push(check);
      return { ...check };
    });
  }

  async updateCheckRun(repo: RepoRef, id: number, input: UpdateCheckRunInput): Promise<CheckRun> {
    return this.withState(repo, async (state) => {
      const check = state.checks.find((c) => c.id === id);
      if (!check) throw new GitProviderError(`Check run ${id} not found`, 'not_found');
      // Same rule as GitHub: a conclusion completes the run.
      if (input.conclusion) {
        check.conclusion = input.conclusion;
        check.status = 'completed';
      } else if (input.status) {
        check.status = input.status;
      }
      if (input.summary !== undefined) check.summary = input.summary;
      return { ...check };
    });
  }

  async mergeState(repo: RepoRef, number: number): Promise<MergeState> {
    const pull = await this.getPullRequest(repo, number);
    if (!pull) throw new GitProviderError(`Pull request #${number} not found`, 'not_found');
    if (pull.state !== 'open') return pull.state;
    // merge-tree --write-tree (git >= 2.38) merges in memory: exit 0 = clean, 1 = conflicts.
    try {
      await this.git(this.repoDir(repo), 'merge-tree', '--write-tree', '--quiet', `refs/heads/${pull.base}`, pull.headSha);
      return 'clean';
    } catch (error) {
      if ((error as { code?: number }).code === 1) return 'conflicts';
      throw new GitProviderError(`Could not compute merge state: ${String(error)}`, 'upstream');
    }
  }

  // PR state from git: merged once the head commit is on the base branch.
  private async toPull(repo: RepoRef, pull: StoredPull): Promise<PullRequest> {
    const dir = this.repoDir(repo);
    const head = await this.getBranch(repo, pull.head);
    if (head) pull.lastHeadSha = head.sha;
    const base = await this.getBranch(repo, pull.base);
    const merged = base ? await this.isAncestor(dir, pull.lastHeadSha, base.sha) : false;
    return {
      number: pull.number,
      title: pull.title,
      body: pull.body,
      head: pull.head,
      base: pull.base,
      headSha: pull.lastHeadSha,
      state: merged ? 'merged' : pull.closed ? 'closed' : 'open',
      url: `local://${repo.owner}/${repo.name}/pull/${pull.number}`,
    };
  }

  // Serialises read-modify-write of one repository's aura-host.json within this process.
  private async withState<T>(repo: RepoRef, fn: (state: HostState) => Promise<T>): Promise<T> {
    const dir = this.repoDir(repo);
    const file = path.join(dir, 'aura-host.json');
    const previous = this.locks.get(file) ?? Promise.resolve();
    const run = previous.then(async () => {
      const state: HostState = await readFile(file, 'utf8').then(
        (raw) => JSON.parse(raw) as HostState,
        () => ({ nextPull: 1, pulls: [], nextCheck: 1, checks: [] }),
      );
      const result = await fn(state);
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
      await rename(tmp, file);
      return result;
    });
    this.locks.set(file, run.catch(() => undefined));
    return run;
  }

  private async commitExists(dir: string, sha: string): Promise<boolean> {
    return this.git(dir, 'cat-file', '-e', `${sha}^{commit}`).then(
      () => true,
      () => false,
    );
  }

  private async isAncestor(dir: string, ancestor: string, of: string): Promise<boolean> {
    return this.git(dir, 'merge-base', '--is-ancestor', ancestor, of).then(
      () => true,
      () => false,
    );
  }

  // --git-dir pins every call to this bare repository. With only a cwd, git would walk up the
  // parent directories and could end up reading some other repository.
  private async git(dir: string, ...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', ['--git-dir', dir, ...args]);
    return stdout.trim();
  }
}
