import { describe, expect, it } from "vitest";
import { chooseTransition } from "./jira.status.js";

const ORDER = ["In Progress", "In Review", "Ready for Release", "Done"];
const transitions = [
  { id: "21", name: "Start", toStatus: "In Progress" },
  { id: "31", name: "Review", toStatus: "In Review" },
  { id: "41", name: "Done", toStatus: "Done" },
];

describe("choosing a Jira transition", () => {
  it("picks the transition into the target status, matching names case-insensitively", () => {
    expect(chooseTransition("To Do", "in progress", transitions, ORDER)).toEqual({ kind: "move", transitionId: "21" });
    expect(chooseTransition("In Progress", "In Review", transitions, ORDER)).toEqual({ kind: "move", transitionId: "31" });
  });

  it("does nothing when the Task is already there", () => {
    expect(chooseTransition("In Review", "in review", transitions, ORDER)).toEqual({ kind: "already" });
  });

  it("never moves a Task backwards along the lifecycle", () => {
    expect(chooseTransition("Done", "In Review", transitions, ORDER)).toEqual({ kind: "behind" });
    expect(chooseTransition("Ready for Release", "In Progress", transitions, ORDER)).toEqual({ kind: "behind" });
  });

  it("reports a status the workflow cannot reach instead of inventing one", () => {
    expect(chooseTransition("In Review", "Ready for Release", transitions, ORDER)).toEqual({ kind: "unreachable" });
  });

  it("moves from a status outside the lifecycle, such as a custom Blocked", () => {
    expect(chooseTransition("Blocked", "In Progress", transitions, ORDER)).toEqual({ kind: "move", transitionId: "21" });
  });
});
