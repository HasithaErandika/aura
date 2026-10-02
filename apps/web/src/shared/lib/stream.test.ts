import { describe, expect, it } from "vitest";
import { applyProgressEvent, applyToolEvent, toStreamEvent } from "./stream.ts";

describe("stream reducers", () => {
  it("keeps only known events with object data", () => {
    expect(toStreamEvent("progress", { stepId: "a" })?.event).toBe("progress");
    expect(toStreamEvent("ping", {})).toBeNull();
    expect(toStreamEvent("text", "raw")).toBeNull();
  });

  it("updates a tool call in place when its result arrives", () => {
    const called = applyToolEvent([], { phase: "call", toolName: "delegate_to_po", toolCallId: "t1", args: { mode: "draft" } });
    const done = applyToolEvent(called, { phase: "result", toolName: "delegate_to_po", toolCallId: "t1", result: { ok: true } });
    expect(done).toEqual([{ toolCallId: "t1", toolName: "delegate_to_po", state: "result", args: { mode: "draft" }, result: { ok: true } }]);
    const failed = applyToolEvent(done, { phase: "error", toolName: "x", toolCallId: "t2", error: "boom" });
    expect(failed[1]).toMatchObject({ state: "error", result: "boom", isError: true });
  });

  it("turns workflow and gateway progress into rows and ignores task events", () => {
    const started = applyProgressEvent([], { stepId: "api-design", phase: "start" });
    const finished = applyProgressEvent(started, { stepId: "api-design", phase: "result", status: "success" });
    expect(finished).toEqual([{ toolCallId: "progress-api-design", toolName: "workflow_step_api-design", state: "result", result: "success" }]);
    expect(applyProgressEvent([], { source: "gateway", outcome: "blocked" })[0]).toMatchObject({ toolName: "gateway", isError: true });
    expect(applyProgressEvent([], { source: "task", kind: "plan" })).toEqual([]);
  });
});
