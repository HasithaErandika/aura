import { ciStateOf, type CiReport, type CiSummary, type TaskPrView } from "./task-prs.types.js";

// What a CI report changes, and who hears about it. Pure, so it is tested directly.
export function applyCiReport(existing: TaskPrView | null, report: CiReport, repo: string): { patch: Record<string, unknown>; notify: "ci_passed" | "ci_failed" | null } {
  const state = ciStateOf(report);
  const summary: CiSummary = { jobs: report.jobs, ...(report.tests ? { tests: report.tests } : {}) };
  const patch: Record<string, unknown> = {
    repo_full_name: repo,
    ci_state: state,
    ci_summary: summary,
    ci_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(report.runUrl ? { ci_url: report.runUrl } : {}),
    ...(report.headSha ? { head_sha: report.headSha } : {}),
  };
  if (report.prNumber && !existing?.prNumber) Object.assign(patch, { pr_number: report.prNumber, pr_url: `https://github.com/${repo}/pull/${report.prNumber}`, pr_state: "open" });
  // Once per result: a re-sent report for the same commit and outcome notifies nobody again.
  const same = existing?.ciState === state && (!report.headSha || existing?.headSha === report.headSha);
  const kind = state === "success" ? "ci_passed" : state === "failure" ? "ci_failed" : null;
  return { patch, notify: kind && !same ? kind : null };
}
