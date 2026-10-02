import { describe, expect, it } from "vitest";
import { taskProgressTitle, workflowStepTitle } from "./progress.ts";

describe("progress titles", () => {
  it("names workflow steps", () => {
    expect(workflowStepTitle("api-design", "start")).toBe("API design...");
    expect(workflowStepTitle("write-tests", "result")).toBe("Test plan done");
    expect(workflowStepTitle("custom", undefined)).toBe("custom done");
  });

  it("names VS Code task events", () => {
    expect(taskProgressTitle({ kind: "plan", taskKey: "KAN-4" })).toBe("Task plan drafted for KAN-4 (Gate 4)");
    expect(taskProgressTitle({ kind: "review", passed: false })).toBe("Code ready for review (Gate 5), checks failing");
    expect(taskProgressTitle({ kind: "pr-step", step: "push" })).toBe("Pull request: push");
    expect(taskProgressTitle({})).toBe("VS Code task update");
  });
});
