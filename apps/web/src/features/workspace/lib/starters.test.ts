import { describe, expect, it } from "vitest";
import { starterInfo } from "./starters.ts";

describe("starterInfo", () => {
  it("uses the agent's suggested prompts when present", () => {
    expect(starterInfo("architect", ["One", " ", "Two"]).prompts).toEqual(["One", "Two"]);
  });

  it("falls back to role prompts", () => {
    expect(starterInfo("business_analyst").prompts[0]).toBe("Break an Epic into user stories");
  });

  it("uses the default guide for roles without one", () => {
    expect(starterInfo("admin").placeholder).toBe("Message the Orchestrator");
  });

  it("caps suggested prompts at four", () => {
    expect(starterInfo("admin", ["a", "b", "c", "d", "e"]).prompts).toHaveLength(4);
  });
});
