import { describe, expect, it } from "vitest";
import type { RunStep } from "../types.ts";
import { buildTimeline, stepDetail } from "./timeline.ts";

let nextId = 1;
function step(kind: RunStep["kind"], payload: Record<string, unknown> | null = null, toolName: string | null = null): RunStep {
  const id = nextId++;
  return { id, seq: id, kind, toolName, toolCallId: null, payload, createdAt: `2026-01-01T00:00:0${id % 10}Z` };
}

describe("buildTimeline", () => {
  it("labels delegate calls with the agent name", () => {
    const [entry] = buildTimeline([step("tool-call", { args: { task: "Draft epic" } }, "delegate_to_po")]);
    expect(entry?.title).toBe("Orchestrator delegated to PO Agent");
    expect(entry?.detail).toBe("Draft epic");
  });

  it("marks failed delegate results as danger", () => {
    const [entry] = buildTimeline([step("tool-result", { result: { ok: false } }, "delegate_to_ba")]);
    expect(entry).toMatchObject({ title: "BA Agent failed", tone: "danger" });
  });

  it("groups consecutive coder steps from VS Code", () => {
    const entries = buildTimeline([
      step("progress", { source: "task", kind: "coding", taskKey: "AUR-1" }),
      step("progress", { source: "task", kind: "step", tool: "edit" }),
      step("progress", { source: "task", kind: "step", tool: "read" }),
      step("progress", { source: "task", kind: "step", tool: "test" }),
      step("progress", { source: "task", kind: "review", taskKey: "AUR-1" }),
    ]);
    expect(entries.map((e) => e.title)).toEqual(["Coders started for AUR-1", "Coder worked through 3 steps", "Code ready for review for AUR-1 (Gate 5)"]);
  });

  it("names workflow steps", () => {
    const [entry] = buildTimeline([step("progress", { stepId: "api-design", phase: "start" })]);
    expect(entry?.title).toBe("API design...");
  });

  it("uses the role label when a run resumes", () => {
    const [entry] = buildTimeline([step("resumed", { role: "business_analyst" })]);
    expect(entry?.title).toBe("Resumed with a Business Analyst decision");
  });
});

describe("stepDetail", () => {
  it("hides draft payloads", () => {
    expect(stepDetail(step("progress", { source: "draft", chars: 10 }))).toBeNull();
  });

  it("returns error messages", () => {
    expect(stepDetail(step("error", { message: "boom" }))).toBe("boom");
  });
});
