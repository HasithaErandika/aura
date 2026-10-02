import { describe, expect, it } from "vitest";
import { leftovers, parseWorktrees } from "./merge-cleanup.js";
import { applyTaskEvent, prEventFrom, type TaskBoard } from "./task-board.js";

const PORCELAIN = `worktree /home/dev/tickets
HEAD abc1234
branch refs/heads/development

worktree /home/dev/tickets/.aura/worktrees/KAN-45_s1
HEAD def5678
branch refs/heads/feat/KAN-36/KAN-45_s1

worktree /home/dev/tickets/.aura/worktrees/KAN-45_s2
HEAD fff0000
branch refs/heads/feat/KAN-36/KAN-45_s2

worktree /home/dev/elsewhere
HEAD 0000000
branch refs/heads/feat/KAN-36/KAN-45_s3

worktree /home/dev/tickets/.aura/worktrees/KAN-46_s1
HEAD 1111111
branch refs/heads/feat/KAN-36/KAN-46_s1

worktree /home/dev/tickets/.aura/worktrees/detached
HEAD 2222222
detached
`;

describe("cleanup after a Task's PR is merged", () => {
  it("reads git's worktree list", () => {
    const list = parseWorktrees(PORCELAIN);
    expect(list).toHaveLength(6);
    expect(list[1]).toEqual({ path: "/home/dev/tickets/.aura/worktrees/KAN-45_s1", branch: "feat/KAN-36/KAN-45_s1" });
    expect(list[5]).toEqual({ path: "/home/dev/tickets/.aura/worktrees/detached", branch: null });
  });

  it("removes only this Task's part worktrees under .aura/worktrees and its _sN branches", () => {
    const branches = ["development", "feat/KAN-36/KAN-45", "feat/KAN-36/KAN-45_s1", "feat/KAN-36/KAN-45_s2", "feat/KAN-36/KAN-45_s1x", "feat/KAN-36/KAN-46_s1"];
    expect(leftovers("feat/KAN-36/KAN-45", parseWorktrees(PORCELAIN), branches)).toEqual({
      worktrees: ["/home/dev/tickets/.aura/worktrees/KAN-45_s1", "/home/dev/tickets/.aura/worktrees/KAN-45_s2"],
      branches: ["feat/KAN-36/KAN-45_s1", "feat/KAN-36/KAN-45_s2"],
    });
  });

  it("shows the merge in the PR view", () => {
    let board: TaskBoard | null = applyTaskEvent(null, { kind: "plan", taskKey: "KAN-45", coder: "x", route: "x", branch: "feat/KAN-36/KAN-45", plan: { summary: "x", steps: [], checks: [], risks: [] } });
    board = applyTaskEvent(board, prEventFrom({ prUrl: "https://github.com/acme/tickets/pull/12", prNumber: 12, prState: "open", branch: "feat/KAN-36/KAN-45", reviewers: [], ciState: "success", ciUrl: null, ciSummary: {} }));
    expect(board!.pr!.prState).toBe("open");
    board = applyTaskEvent(board, prEventFrom({ prUrl: "https://github.com/acme/tickets/pull/12", prNumber: 12, prState: "merged", branch: "feat/KAN-36/KAN-45", reviewers: [], ciState: "success", ciUrl: null, ciSummary: {} }));
    expect(board!.pr).toMatchObject({ prState: "merged", ciState: "success" });
  });
});
