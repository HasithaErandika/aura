import { describe, expect, it } from "vitest";
import { TOOL_LABELS, gatewayDetail, gatewaySummary, toolLabel } from "./gateway.ts";

describe("gateway text", () => {
  it("labels only current delegate tools", () => {
    expect(Object.keys(TOOL_LABELS).sort()).toEqual(
      ["delegate_to_architect", "delegate_to_ba", "delegate_to_coder", "delegate_to_deploy", "delegate_to_planner", "delegate_to_po", "delegate_to_pr", "delegate_to_qa", "delegate_to_review"].sort(),
    );
    expect(toolLabel("delegate_to_planner")).toBe("Task Planner");
    expect(toolLabel("unknown_tool")).toBe("unknown_tool");
    expect(toolLabel(undefined)).toBe("tool");
  });

  it("summarises a blocked step and its findings", () => {
    expect(gatewaySummary({ tool: "delegate_to_po", outcome: "blocked", reason: "loop_guard" })).toEqual({ title: "Safety check stopped PO Agent: stopped a loop", tone: "warning" });
    expect(gatewaySummary({ tool: "delegate_to_qa", outcome: "ok" }).tone).toBe("success");
    expect(gatewayDetail({ message: "m", durationMs: 1500 })).toBe("m\nTook 1.5s");
  });
});
