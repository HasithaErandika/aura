import { describe, expect, it } from "vitest";
import { PIPELINE, gateNumberLabel, gateTitle, stagesFor } from "./pipeline.ts";

describe("gate pipeline", () => {
  it("lists Gates 1-3, the test plan, Gates 4-6 in VS Code and Gate 8", () => {
    expect(PIPELINE.map((s) => gateNumberLabel(s.gate))).toEqual(["Gate 1", "Gate 2", "Gate 3", "Test plan", "Gate 4", "Gate 5", "Gate 6", "Gate 8"]);
    expect(PIPELINE.filter((s) => s.surface === "vscode").map((s) => s.gate)).toEqual([4, 5, 6]);
  });

  it("titles a gate without printing a null number", () => {
    expect(gateTitle({ number: 2, name: "Story approval" })).toBe("Gate 2: Story approval");
    expect(gateTitle({ number: null, name: "Test plan approval" })).toBe("Test plan approval");
    expect(gateTitle(null)).toBe("Question from the Orchestrator");
  });

  it("picks stages by Jira issue type", () => {
    expect(stagesFor("Epic")).toHaveLength(8);
    expect(stagesFor("Task").map((s) => s.gate)).toEqual([4, 5, 6]);
    expect(stagesFor("Story")).toEqual([]);
  });
});
