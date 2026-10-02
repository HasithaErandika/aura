import { describe, expect, it, vi } from "vitest";
import type { ToolRequestMessage } from "@aura/bridge";
import { executeRequest, scopeToWorktree } from "./bridge-client.js";
import { PermissionPolicy } from "./permissions.js";
import { applyTaskEvent } from "./task-board.js";

const request = (op: string, args: Record<string, unknown>, worktree?: string) => ({ type: "tool.request", callId: "c1", runId: "r1", op, args, timeoutMs: 1000, ...(worktree !== undefined ? { worktree } : {}) }) as ToolRequestMessage;

describe("parallel parts: worktree-scoped requests", () => {
  it("resolves paths and the command folder inside .aura/worktrees/<name>", () => {
    expect(scopeToWorktree("fs.writeFile", { path: "./src/a.ts", content: "x" }, "KAN-45_s1")).toEqual({ path: ".aura/worktrees/KAN-45_s1/src/a.ts", content: "x" });
    expect(scopeToWorktree("fs.moveFile", { src: "a.ts", dest: "b/a.ts" }, "KAN-45_s1")).toEqual({ src: ".aura/worktrees/KAN-45_s1/a.ts", dest: ".aura/worktrees/KAN-45_s1/b/a.ts" });
    expect(scopeToWorktree("sandbox.exec", { command: "npm test" }, "KAN-45_s2")).toEqual({ command: "npm test", cwd: ".aura/worktrees/KAN-45_s2" });
    expect(scopeToWorktree("fs.readFile", { path: "../KAN-45_s2/a.ts" }, "KAN-45_s1")).toBeNull();
  });

  it("checks permissions on the path the agent asked for, and runs it in the worktree", async () => {
    const policy = new PermissionPolicy();
    policy.mode = "acceptEdits";
    const executor = { run: vi.fn(async () => null) };
    const outcome = await executeRequest(request("fs.writeFile", { path: "src/a.ts", content: "x" }, "KAN-45_s1"), { executor: executor as never, policy, ask: vi.fn(), log: vi.fn() });
    expect(outcome.ok).toBe(true);
    expect(executor.run).toHaveBeenCalledWith("fs.writeFile", { path: ".aura/worktrees/KAN-45_s1/src/a.ts", content: "x" }, expect.anything());
  });

  it("refuses a bad worktree name or a path that leaves the worktree", async () => {
    const executor = { run: vi.fn() };
    const options = { executor: executor as never, policy: new PermissionPolicy(), ask: vi.fn(), log: vi.fn() };
    expect(await executeRequest(request("fs.readFile", { path: "a.ts" }, "../x"), options)).toMatchObject({ ok: false, error: { code: "invalid" } });
    expect(await executeRequest(request("fs.readFile", { path: "../../../a.ts" }, "KAN-45_s1"), options)).toMatchObject({ ok: false, error: { code: "outside_workspace" } });
    expect(executor.run).not.toHaveBeenCalled();
  });
});

describe("Plan view: parallel parts checklist", () => {
  const plan = {
    kind: "plan",
    taskKey: "KAN-45",
    coder: "backend-nestjs",
    route: "Backend Task",
    branch: "feat/KAN-36/KAN-45",
    plan: { summary: "API and page.", steps: [], checks: ["npm test"], risks: [] },
    subtasks: [
      { n: 1, title: "Tickets API", coder: "backend-nestjs", branch: "feat/KAN-36/KAN-45_s1", scope: ["apps/api/src/tickets"] },
      { n: 2, title: "Tickets page", coder: "frontend-react", branch: "feat/KAN-36/KAN-45_s2", scope: ["apps/web/src/features/tickets"] },
    ],
  };

  it("follows each part from coding to merged", () => {
    let board = applyTaskEvent(null, plan);
    expect(board!.parts.map((p) => p.status)).toEqual(["planned", "planned"]);
    board = applyTaskEvent(board, { kind: "coding", subtasks: plan.subtasks, maxRounds: 3 });
    board = applyTaskEvent(board, { kind: "part", stage: "subtask", subtask: 1, status: "coding" });
    board = applyTaskEvent(board, { kind: "step", subtask: 2, phase: "evaluator", round: 1, status: "start" });
    expect(board!.parts.map((p) => p.status)).toEqual(["coding", "evaluator (round 1)"]);
    expect(board!.activity.at(-1)).toBe("[2] Evaluator (round 1)…");
    board = applyTaskEvent(board, { kind: "part", stage: "subtask", subtask: 1, status: "passed", passed: true });
    board = applyTaskEvent(board, { kind: "part", stage: "merge", subtask: 1, status: "clean", passed: true });
    board = applyTaskEvent(board, { kind: "part", stage: "merge", subtask: 2, status: "resolved", passed: true });
    expect(board!.parts.map((p) => p.merge)).toEqual(["clean", "resolved"]);
    board = applyTaskEvent(board, { kind: "review", passed: true, rounds: 1, baseRef: "abc1234def", changedFiles: [], checks: [], verdict: { summary: "ok", findings: [] }, subtasks: [{ n: 1, rounds: 1, passed: true, merge: "clean" }, { n: 2, rounds: 2, passed: true, merge: "resolved" }] });
    expect(board!.review!.baseRef).toBe("abc1234def");
    expect(board!.parts[1]).toMatchObject({ rounds: 2, passed: true, merge: "resolved" });
  });
});
