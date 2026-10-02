export type CiState = "pending" | "running" | "success" | "failure" | "cancelled";

interface CiJob {
  name: string;
  result: string;
}

export interface CiSummary {
  jobs?: CiJob[];
  tests?: { passed: number; failed: number; skipped: number };
}

export interface TaskPrRow {
  task_key: string;
  epic_key: string | null;
  repo_full_name: string | null;
  branch: string;
  pr_number: number | null;
  pr_url: string | null;
  pr_title: string | null;
  pr_state: TaskPrView["prState"];
  reviewers: string[] | null;
  head_sha: string | null;
  merged_at: string | null;
  merge_sha: string | null;
  ci_state: CiState | null;
  ci_url: string | null;
  ci_summary: CiSummary | null;
  ci_updated_at: string | null;
  opened_by: string | null;
  run_id: string | null;
  updated_at: string;
}

export interface TaskPrView {
  taskKey: string;
  epicKey: string | null;
  repo: string | null;
  branch: string;
  prNumber: number | null;
  prUrl: string | null;
  prTitle: string | null;
  prState: "open" | "merged" | "closed" | null;
  reviewers: string[];
  headSha: string | null;
  mergedAt: string | null;
  mergeSha: string | null;
  ciState: CiState | null;
  ciUrl: string | null;
  ciSummary: CiSummary;
  ciUpdatedAt: string | null;
  openedBy: string | null;
  runId: string | null;
  updatedAt: string;
}

export function toTaskPrView(r: TaskPrRow): TaskPrView {
  return {
    taskKey: r.task_key,
    epicKey: r.epic_key,
    repo: r.repo_full_name,
    branch: r.branch,
    prNumber: r.pr_number,
    prUrl: r.pr_url,
    prTitle: r.pr_title,
    prState: r.pr_state,
    reviewers: r.reviewers ?? [],
    headSha: r.head_sha,
    mergedAt: r.merged_at,
    mergeSha: r.merge_sha,
    ciState: r.ci_state,
    ciUrl: r.ci_url,
    ciSummary: r.ci_summary ?? {},
    ciUpdatedAt: r.ci_updated_at,
    openedBy: r.opened_by,
    runId: r.run_id,
    updatedAt: r.updated_at,
  };
}

const TASK_BRANCH = /^feat\/(?:([A-Z][A-Z0-9_]*-\d+)\/)?([A-Z][A-Z0-9_]*-\d+)$/;

// feat/<EPIC>/<TASK> or feat/<TASK>; null for any other branch.
export function taskFromBranch(branch: string): { taskKey: string; epicKey: string | null } | null {
  const m = TASK_BRANCH.exec(branch);
  return m ? { taskKey: m[2]!, epicKey: m[1] ?? null } : null;
}

export function ciStateOf(report: { status: "in_progress" | "completed"; conclusion?: "success" | "failure" | "cancelled" }): CiState {
  if (report.status === "in_progress") return "running";
  return report.conclusion ?? "failure";
}
