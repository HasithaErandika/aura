import { describe, expect, it } from "vitest";
import type { JiraComment } from "../types.ts";
import { pipelineProgress } from "./pipeline.ts";

const comment = (body: string): JiraComment => ({ id: body, author: "AURA", body, created: "2026-01-01", updated: null });

describe("pipelineProgress", () => {
  it("marks Epic stages done from the provenance stamp", () => {
    const stages = pipelineProgress("Epic", [comment("Created by: AURA · PO Agent v3 (prompt v2)"), comment("Created by: AURA · BA Agent v1")]);
    expect(stages.map((s) => [s.short, s.state])).toEqual([
      ["Epic", "done"],
      ["Stories", "done"],
      ["Architecture", "pending"],
      ["Test plan", "pending"],
      ["Task plan", "vscode"],
      ["Code review", "vscode"],
      ["Pull request", "vscode"],
      ["Release plan", "pending"],
    ]);
  });

  it("shows only the VS Code gates on a Task", () => {
    expect(pipelineProgress("Task", []).map((s) => s.gate)).toEqual([4, 5, 6]);
  });

  it("has no tracker for Stories and Bugs", () => {
    expect(pipelineProgress("Story", [])).toEqual([]);
    expect(pipelineProgress("Bug", [])).toEqual([]);
  });
});
