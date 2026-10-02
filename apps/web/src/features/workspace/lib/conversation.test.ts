import { describe, expect, it } from "vitest";
import { applyStreamEvent, commitStreaming, newMessage, type LiveState } from "./conversation.ts";

const empty: LiveState = { streaming: null, pendingGate: null, runStatus: null, liveRunId: null, error: null };

describe("applyStreamEvent", () => {
  it("records the run id and status", () => {
    const next = applyStreamEvent(empty, { event: "run", data: { runId: "r1", runtimeRunId: null, status: "RUNNING" } });
    expect(next).toMatchObject({ liveRunId: "r1", runStatus: "RUNNING" });
    expect(next.streaming?.role).toBe("assistant");
  });

  it("appends text deltas", () => {
    let s = applyStreamEvent(empty, { event: "text", data: { delta: "Hel" } });
    s = applyStreamEvent(s, { event: "text", data: { delta: "lo" } });
    expect(s.streaming?.text).toBe("Hello");
  });

  it("tracks tool calls and results", () => {
    let s = applyStreamEvent(empty, { event: "tool", data: { phase: "call", toolName: "delegate_to_po", toolCallId: "t1" } });
    s = applyStreamEvent(s, { event: "tool", data: { phase: "result", toolName: "delegate_to_po", toolCallId: "t1", result: { ok: true } } });
    expect(s.streaming?.tools).toHaveLength(1);
    expect(s.streaming?.tools[0]?.state).toBe("result");
  });

  it("shows workflow progress as tool rows", () => {
    const s = applyStreamEvent(empty, { event: "progress", data: { stepId: "api-design", phase: "start" } });
    expect(s.streaming?.tools[0]?.toolName).toBe("workflow_step_api-design");
  });

  it("opens and clears a gate", () => {
    const gate = { approvalId: "a1", runId: "r1", producingAgent: "po-agent", gate: { number: 1, name: "Epic", outcome: "Filed" }, requiredRole: null, question: "Ok?", options: [], selectionMode: null, snapshot: null, expiresAt: "", canDecide: true };
    let s = applyStreamEvent(empty, { event: "gate", data: gate });
    expect(s.runStatus).toBe("SUSPENDED_FOR_APPROVAL");
    expect(s.pendingGate?.snapshotHash).toBeNull();
    s = applyStreamEvent(s, { event: "decision", data: { approvalId: "a1", status: "APPROVED", decision: "approve" } });
    expect(s.pendingGate).toBeNull();
  });

  it("keeps the error message and the final status", () => {
    let s = applyStreamEvent(empty, { event: "error", data: { message: "Stopped" } });
    s = applyStreamEvent(s, { event: "done", data: { runId: "r1", status: "INTERRUPTED", approvalId: null } });
    expect(s).toMatchObject({ error: "Stopped", runStatus: "INTERRUPTED" });
  });
});

describe("commitStreaming", () => {
  it("skips empty assistant messages", () => {
    expect(commitStreaming([], newMessage("assistant"))).toEqual([]);
  });

  it("adds a message with text", () => {
    expect(commitStreaming([], newMessage("assistant", "Hi"))).toHaveLength(1);
  });
});
