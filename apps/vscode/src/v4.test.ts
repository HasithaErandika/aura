import { describe, expect, it, vi } from "vitest";
import type { ToolRequestMessage } from "@aura/bridge";
import { executeRequest } from "./bridge-client.js";
import { PermissionPolicy } from "./permissions.js";
import { applyTaskEvent } from "./task-board.js";
import { addNote, applyEvent, emptyChat } from "./chat/model.js";

const request = (op: string, args: Record<string, unknown>, readOnly = false) => ({ type: "tool.request", callId: "c1", runId: "r1", op, args, timeoutMs: 1000, ...(readOnly ? { readOnly } : {}) }) as ToolRequestMessage;

describe("Gate 4 plan lock", () => {
  it("answers a locked call as plan mode, even in accept-edits mode", async () => {
    const policy = new PermissionPolicy();
    policy.mode = "acceptEdits";
    expect(policy.decide("fs.writeFile", { path: "a.ts", content: "x" }).kind).toBe("allow");
    expect(policy.decide("fs.writeFile", { path: "a.ts", content: "x" }, "plan")).toMatchObject({ kind: "deny", reason: expect.stringContaining("Gate 4") });
    expect(policy.decide("sandbox.exec", { command: "git status" }, "plan").kind).toBe("allow");

    const executor = { run: vi.fn() };
    const outcome = await executeRequest(request("fs.writeFile", { path: "a.ts", content: "x" }, true), { executor: executor as never, policy, ask: vi.fn(), log: vi.fn() });
    expect(outcome).toMatchObject({ ok: false, error: { code: "denied" } });
    expect(executor.run).not.toHaveBeenCalled();
  });
});

describe("Plan and Review views", () => {
  const plan = { kind: "plan", draftId: "PLAN-1", taskKey: "KAN-45", coder: "frontend-react", route: "Frontend Task", plan: { summary: "Add the list.", steps: [{ title: "Add TicketList", detail: "", files: ["src/TicketList.tsx"] }], checks: ["npm test"], risks: [] } };

  it("follows a Task from plan to accepted", () => {
    let board = applyTaskEvent(null, plan);
    expect(board).toMatchObject({ taskKey: "KAN-45", status: "plan-review", coder: "frontend-react" });
    board = applyTaskEvent(board, { kind: "coding", coder: "frontend-react", maxRounds: 3 });
    board = applyTaskEvent(board, { kind: "step", phase: "coder", round: 1, status: "start" });
    board = applyTaskEvent(board, { kind: "step", phase: "coder-tool", round: 1, tool: "mastra_workspace_write_file", detail: "src/TicketList.tsx" });
    board = applyTaskEvent(board, { kind: "step", phase: "checks", round: 1, status: "done", passed: true, detail: "✓ npm test" });
    expect(board!.activity).toEqual(["Coder (round 1)…", "  write file src/TicketList.tsx", "Checks: ✓ ✓ npm test"]);
    board = applyTaskEvent(board, { kind: "review", draftId: "REVIEW-1", passed: true, rounds: 1, changedFiles: [{ path: "src/TicketList.tsx", status: "untracked" }], checks: [{ command: "npm test", passed: true, exitCode: 0 }], verdict: { summary: "Good.", findings: [] } });
    expect(board).toMatchObject({ status: "code-review", review: { passed: true, changedFiles: [{ path: "src/TicketList.tsx" }] } });
    expect(applyTaskEvent(board, { kind: "accepted" })!.status).toBe("accepted");
  });

  it("ignores Task events before a plan", () => {
    expect(applyTaskEvent(null, { kind: "coding" })).toBeNull();
  });
});

describe("chat: gates and notes", () => {
  it("shows a gate card, marks it decided, and keeps the Task board", () => {
    let state = applyEvent(emptyChat("KAN-45"), { event: "gate", data: { approvalId: "a1", runId: "r1", producingAgent: "task-planner", gate: { number: 4, name: "Task plan approval", outcome: "" }, question: "Approve the plan?", options: [{ label: "Approve" }, { label: "Revise" }], snapshot: null, canDecide: true } });
    expect(state.items.at(-1)).toMatchObject({ kind: "gate", title: "Gate 4: Task plan approval", decided: null });
    state = applyEvent(state, { event: "decision", data: { approvalId: "a1", status: "APPROVED", decision: "approve" } });
    expect(state.items.at(-1)).toMatchObject({ kind: "gate", decided: "approve" });
    state = applyEvent(state, { event: "progress", data: { source: "task", kind: "plan", taskKey: "KAN-45", coder: "issue-solver", route: "Bug", plan: { summary: "x", steps: [], checks: [], risks: [] } } });
    expect(state.task?.coder).toBe("issue-solver");
    expect(addNote(state, "use the shared Table").items.at(-1)).toMatchObject({ kind: "note", text: "use the shared Table" });
  });
});
