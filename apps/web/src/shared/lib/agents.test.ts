import { describe, expect, it } from "vitest";
import { agentLabel, agentSurface } from "./agents.ts";

describe("agent labels", () => {
  it("names current agents, coder variants and eval runs", () => {
    expect(agentLabel("po-agent")).toBe("PO Agent");
    expect(agentLabel("task-planner")).toBe("Task Planner");
    expect(agentLabel("coder-claude")).toBe("Coder (claude)");
    expect(agentLabel("eval:qa-agent")).toBe("Eval: QA Agent");
    expect(agentLabel(null)).toBe("Orchestrator");
    expect(agentLabel("something-new")).toBe("something-new");
  });

  it("knows which agents run in VS Code", () => {
    expect(agentSurface("git-agent")).toBe("vscode");
    expect(agentSurface("coder-codex")).toBe("vscode");
    expect(agentSurface("ba-agent")).toBe("web");
  });
});
