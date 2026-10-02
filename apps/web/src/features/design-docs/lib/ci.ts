import type { Tone } from "@/shared/lib/tone.ts";
import type { CiState, TaskPr } from "../types.ts";

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

export function ciDetail(pr: Pick<TaskPr, "ciSummary">): string {
  const t = pr.ciSummary.tests;
  if (t) return `${t.passed} passed, ${t.failed} failed, ${t.skipped} skipped`;
  const jobs = pr.ciSummary.jobs ?? [];
  const failed = jobs.filter((j) => j.result === "failure").map((j) => j.name);
  if (failed.length) return `Failed: ${failed.join(", ")}`;
  return jobs.length ? `${jobs.length} job${jobs.length === 1 ? "" : "s"}` : "";
}

export function qaBadge(state: TaskPr["qaState"]): { tone: Tone; label: string } {
  switch (state) {
    case "success":
      return { tone: "success", label: "QA passed" };
    case "failure":
      return { tone: "danger", label: "QA failed" };
    case "pending":
      return { tone: "neutral", label: "QA waiting" };
    default:
      return { tone: "outline", label: "No QA check yet" };
  }
}

export function qaDetail(pr: Pick<TaskPr, "qaSummary">): string {
  const q = pr.qaSummary;
  if (!q) return "";
  if (!q.required.length) return "No scenarios linked";
  const parts = [`${q.passed.length}/${q.required.length} scenarios`];
  if (q.failed.length) parts.push(`failed: ${q.failed.join(", ")}`);
  if (q.missing.length) parts.push(`not tested: ${q.missing.join(", ")}`);
  return parts.join(" · ");
}
