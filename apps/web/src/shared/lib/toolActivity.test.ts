import { describe, expect, it } from "vitest";
import { describeTool } from "./toolActivity.ts";

describe("tool activity text", () => {
  it("describes delegations with their mode", () => {
    expect(describeTool({ toolCallId: "1", toolName: "delegate_to_ba", state: "call", args: { mode: "DRAFT" } }).title).toBe("Delegating to BA Agent (draft)");
    expect(describeTool({ toolCallId: "1", toolName: "delegate_to_qa", state: "result", args: { task: "MODE 2 - FILE it" }, result: { ok: false, result: "no epic" } })).toEqual({
      title: "QA Agent failed (file)",
      detail: "no epic",
    });
  });

  it("describes workflow steps and plain tools", () => {
    expect(describeTool({ toolCallId: "p", toolName: "workflow_step_data-design", state: "call" }).title).toBe("Data design...");
    expect(describeTool({ toolCallId: "x", toolName: "jira_search", state: "result" }).title).toBe("jira_search finished");
    expect(describeTool({ toolCallId: "a", toolName: "ask_user", state: "call" }).title).toBe("Asked for a human decision");
  });
});
