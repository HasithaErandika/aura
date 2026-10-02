import { describe, expect, it } from "vitest";
import { qaVerdict, scenarioId } from "./qa-check.js";
import { ciReportSchema, storiesSchema } from "./task-prs.schemas.js";

describe("AURA QA check", () => {
  it("passes only when every required scenario has a passing test", () => {
    expect(qaVerdict(["create-ticket", "list-tickets"], [{ id: "create-ticket", result: "passed" }, { id: "list-tickets", result: "passed" }, { id: "other", result: "failed" }])).toEqual({
      state: "success",
      summary: { required: ["create-ticket", "list-tickets"], passed: ["create-ticket", "list-tickets"], failed: [], missing: [] },
      description: "All 2 QA scenarios passed",
    });
  });

  it("fails on a failed or untested scenario and says which", () => {
    const v = qaVerdict(["a", "b", "c"], [{ id: "a", result: "passed" }, { id: "b", result: "failed" }, { id: "c", result: "skipped" }]);
    expect(v.state).toBe("failure");
    expect(v.summary).toEqual({ required: ["a", "b", "c"], passed: ["a"], failed: ["b"], missing: ["c"] });
    expect(v.description).toBe("1/3 QA scenarios passed (1 failed, 1 not tested)");
    expect(qaVerdict(["a"], []).summary.missing).toEqual(["a"]);
  });

  it("counts a scenario as failed when any of its tests failed", () => {
    expect(qaVerdict(["a"], [{ id: "a", result: "passed" }, { id: "a", result: "failed" }]).state).toBe("failure");
    expect(qaVerdict(["a"], [{ id: "a", result: "skipped" }, { id: "a", result: "passed" }]).state).toBe("success");
  });

  it("passes with nothing to check when no scenarios are linked", () => {
    expect(qaVerdict([], [])).toMatchObject({ state: "success", description: "No QA scenarios are linked to this Task" });
  });

  it("names scenarios by file name, as tests tag them", () => {
    expect(scenarioId("qa/create-ticket")).toBe("create-ticket");
  });

  it("accepts scenario results and Story links in the shapes CI and Gate 3 send", () => {
    expect(ciReportSchema.parse({ status: "completed", conclusion: "success", branch: "feat/KAN-45", scenarios: [{ id: "create-ticket", result: "passed" }] }).scenarios).toHaveLength(1);
    expect(() => ciReportSchema.parse({ status: "completed", branch: "feat/KAN-45", scenarios: [{ id: "../etc", result: "passed" }] })).toThrow();
    expect(() => storiesSchema.parse({ stories: [{ taskKey: "KAN-45", storyKey: "nope" }] })).toThrow();
  });
});
