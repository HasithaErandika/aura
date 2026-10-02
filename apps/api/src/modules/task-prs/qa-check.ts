// The AURA QA check (roadmap step 3.7): a Task's pull request passes only when every QA scenario
// of the Stories it implements has a passing test in CI. Tests carry the scenario's id in their
// name ([qa:<file name>]); aura-ci.yml reads the results from JUnit reports.

export type ScenarioResult = "passed" | "failed" | "skipped";

export interface QaSummary {
  required: string[];
  passed: string[];
  failed: string[];
  missing: string[];
}

export interface QaVerdict {
  state: "success" | "failure";
  summary: QaSummary;
  description: string;
}

// Scenario documents are saved as qa/<file name>; tests name them by the file name alone.
export const scenarioId = (slug: string) => slug.replace(/^qa\//, "");

export function qaVerdict(required: string[], results: { id: string; result: ScenarioResult }[]): QaVerdict {
  // A scenario counts as passed only when every test tagged with it passed.
  const outcome = new Map<string, ScenarioResult>();
  for (const r of results) {
    const before = outcome.get(r.id);
    if (before === "failed" || r.result === "failed") outcome.set(r.id, "failed");
    else if (before === "passed" || r.result === "passed") outcome.set(r.id, "passed");
    else outcome.set(r.id, "skipped");
  }
  const ids = [...new Set(required)].sort();
  const passed = ids.filter((id) => outcome.get(id) === "passed");
  const failed = ids.filter((id) => outcome.get(id) === "failed");
  const missing = ids.filter((id) => !outcome.has(id) || outcome.get(id) === "skipped");
  const summary = { required: ids, passed, failed, missing };
  if (!ids.length) return { state: "success", summary, description: "No QA scenarios are linked to this Task" };
  if (failed.length || missing.length) {
    const parts = [failed.length ? `${failed.length} failed` : "", missing.length ? `${missing.length} not tested` : ""].filter(Boolean).join(", ");
    return { state: "failure", summary, description: `${passed.length}/${ids.length} QA scenarios passed (${parts})` };
  }
  return { state: "success", summary, description: `All ${ids.length} QA scenarios passed` };
}
