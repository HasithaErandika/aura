import type { Tone } from "../../shared/ui/Badge.tsx";

// Each Task's pull request and its CI (apps/api /task-prs, V6), as the QA page shows it.

export type CiState = "pending" | "running" | "success" | "failure" | "cancelled";

export interface TaskPr {
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
  ciState: CiState | null;
  ciUrl: string | null;
  ciSummary: { jobs?: { name: string; result: string }[]; tests?: { passed: number; failed: number; skipped: number } };
  ciUpdatedAt: string | null;
  updatedAt: string;
}

export function ciBadge(state: CiState | null): { tone: Tone; label: string } {
  switch (state) {
    case "success":
      return { tone: "success", label: "CI passed" };
    case "failure":
      return { tone: "danger", label: "CI failed" };
    case "running":
      return { tone: "warning", label: "CI running" };
    case "pending":
      return { tone: "neutral", label: "CI waiting" };
    case "cancelled":
      return { tone: "neutral", label: "CI cancelled" };
    default:
      return { tone: "outline", label: "No CI yet" };
  }
}

// One line for the test summary or, without one, the jobs that failed.
export function ciDetail(pr: Pick<TaskPr, "ciSummary">): string {
  const t = pr.ciSummary.tests;
  if (t) return `${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped`;
  const jobs = pr.ciSummary.jobs ?? [];
  const failed = jobs.filter((j) => j.result === "failure").map((j) => j.name);
  if (failed.length) return `Failed: ${failed.join(", ")}`;
  return jobs.length ? `${jobs.length} job${jobs.length === 1 ? "" : "s"}` : "";
}
