// The one boundary between AURA and a Git host (docs/plans/aura-git-control-plane.md Phase 1.2,
// ADR-3 D2). Gate 4 (branch), Gate 5 (push + PR) and Gate 7 (check run on the PR head) go
// through this interface only, so the same flow runs against GitHub (the `github` provider, via a
// GitHub App) and against bare repositories on disk (the `local` provider, for tests and
// offline use).
//
// Providers never decide whether an action is allowed: every call here comes from a deterministic
// execute step that already has a recorded human approval. In particular there is no merge
// method - merging to the default branch always stays a human action on the Git host.

export type GitProviderKind = 'github' | 'local';

// A registered repository (apps/api `repositories`, migration 0007).
export interface RepoRef {
  provider: GitProviderKind;
  owner: string;
  name: string;
  defaultBranch: string;
  installationId?: number | null;
}

export interface BranchRef {
  name: string;
  sha: string;
}

export type PullRequestState = 'open' | 'merged' | 'closed';

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  head: string; // branch name
  base: string; // branch name
  headSha: string;
  state: PullRequestState;
  url: string;
}

export interface OpenPullRequestInput {
  head: string;
  base?: string; // defaults to the repository's default branch
  title: string;
  body: string;
}

export type CheckStatus = 'queued' | 'in_progress' | 'completed';
export type CheckConclusion = 'success' | 'failure' | 'neutral' | 'cancelled';

export interface CheckRun {
  id: number;
  name: string;
  headSha: string;
  status: CheckStatus;
  conclusion: CheckConclusion | null;
  summary: string;
}

export interface CreateCheckRunInput {
  name: string; // e.g. "AURA QA"
  headSha: string;
  status?: CheckStatus;
  summary?: string;
}

export interface UpdateCheckRunInput {
  status?: CheckStatus;
  conclusion?: CheckConclusion;
  summary?: string;
}

// Whether a PR's head can merge into its base right now.
export type MergeState = 'clean' | 'conflicts' | 'merged' | 'closed';

export interface GitProvider {
  readonly kind: GitProviderKind;
  // URL a clone fetches from and pushes to. For GitHub it carries a short-lived installation
  // token, so it's never logged or stored.
  remoteUrl(repo: RepoRef): Promise<string>;
  getBranch(repo: RepoRef, branch: string): Promise<BranchRef | null>;
  // Creates `branch` at `fromSha` (default: the head of the default branch). Idempotent: an
  // existing branch at the same commit is returned as is; at a different commit it's an error.
  createBranch(repo: RepoRef, branch: string, fromSha?: string): Promise<BranchRef>;
  // Pushes `branch` from a local clone/worktree. Never forces.
  push(repo: RepoRef, workDir: string, branch: string): Promise<BranchRef>;
  // Idempotent: an open PR for the same head and base is returned instead of a second one.
  openPullRequest(repo: RepoRef, input: OpenPullRequestInput): Promise<PullRequest>;
  getPullRequest(repo: RepoRef, number: number): Promise<PullRequest | null>;
  createCheckRun(repo: RepoRef, input: CreateCheckRunInput): Promise<CheckRun>;
  updateCheckRun(repo: RepoRef, id: number, input: UpdateCheckRunInput): Promise<CheckRun>;
  mergeState(repo: RepoRef, number: number): Promise<MergeState>;
}

export class GitProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'conflict' | 'invalid' | 'upstream',
  ) {
    super(message);
    this.name = 'GitProviderError';
  }
}

// Same rules as apps/api projects.schemas.ts and migration 0007's CHECK constraints. Checked
// again here because owner/name become filesystem paths (local) and URL segments (GitHub).
const OWNER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

export function assertValidRepoRef(repo: RepoRef): void {
  if (!OWNER.test(repo.owner)) throw new GitProviderError(`Invalid repository owner: ${JSON.stringify(repo.owner)}`, 'invalid');
  if (!NAME.test(repo.name) || repo.name === '.' || repo.name === '..') throw new GitProviderError(`Invalid repository name: ${JSON.stringify(repo.name)}`, 'invalid');
  assertValidBranch(repo.defaultBranch);
}

// A subset of `git check-ref-format --branch`, enough to keep a model- or Jira-derived value from
// becoming an option (leading "-") or a revision expression.
export function assertValidBranch(branch: string): void {
  const bad = !branch || branch.length > 255 || /(^[/.-])|([/.]$)|\.\.|[\s~^:?*[\\]|@\{|\/\/|[\x00-\x1f\x7f]/.test(branch) || branch.endsWith('.lock') || branch === '@';
  if (bad) throw new GitProviderError(`Invalid branch name: ${JSON.stringify(branch)}`, 'invalid');
}
