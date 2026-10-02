import type { ToolActivityItem } from "../api/types.ts";
import { gatewayDetail, gatewaySummary, isDelegateTool, toolLabel, type GatewayEvent } from "./gateway.ts";
import { workflowStepTitle } from "./progress.ts";

function stringField(value: unknown, key: string): string | null {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  return typeof v === "string" ? v : null;
}

function delegateMode(args: unknown): string | null {
  const mode = stringField(args, "mode");
  if (mode) return mode.toLowerCase();
  const task = stringField(args, "task");
  return task ? (/MODE\s*\d+\s*-\s*(\w+)/i.exec(task)?.[1]?.toLowerCase() ?? null) : null;
}

export function describeTool(tool: ToolActivityItem): { title: string; detail: string | null } {
  const name = tool.toolName;
  if (name.startsWith("workflow_step_")) {
    return { title: workflowStepTitle(name.slice("workflow_step_".length), tool.state === "call" ? "start" : "result"), detail: null };
  }
  if (isDelegateTool(name)) {
    const label = toolLabel(name);
    const mode = delegateMode(tool.args);
    const suffix = mode ? ` (${mode})` : "";
    if (tool.state === "call") return { title: `Delegating to ${label}${suffix}`, detail: null };
    if (tool.state === "error") return { title: `${label} failed${suffix}`, detail: typeof tool.result === "string" ? tool.result : null };
    const result = tool.result as { ok?: boolean; result?: unknown } | undefined;
    const ok = result && typeof result === "object" && "ok" in result ? result.ok !== false : true;
    return { title: `${label} ${ok ? "responded" : "failed"}${suffix}`, detail: stringField(result, "result") };
  }
  if (name === "ask_user") return { title: "Asked for a human decision", detail: null };
  if (name === "gateway") {
    const event = (tool.result ?? {}) as GatewayEvent;
    return { title: gatewaySummary(event).title, detail: gatewayDetail(event) || null };
  }
  return { title: tool.state === "call" ? `Calling ${name}` : `${name} finished`, detail: null };
}
