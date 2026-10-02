import type { ProgressData, StreamEvent, ToolActivityItem } from "../api/types.ts";

const STREAM_EVENTS = new Set(["run", "text", "tool", "gate", "decision", "progress", "error", "done"]);

export function toStreamEvent(event: string, data: unknown): StreamEvent | null {
  return STREAM_EVENTS.has(event) && data !== null && typeof data === "object" ? ({ event, data } as StreamEvent) : null;
}

type ToolData = Extract<StreamEvent, { event: "tool" }>["data"];

export function applyToolEvent(tools: ToolActivityItem[], data: ToolData): ToolActivityItem[] {
  const idx = data.toolCallId ? tools.findIndex((t) => t.toolCallId === data.toolCallId) : -1;
  const base = idx >= 0 ? tools[idx]! : { toolCallId: data.toolCallId, toolName: data.toolName, args: undefined };
  const next: ToolActivityItem =
    data.phase === "call"
      ? { toolCallId: data.toolCallId, toolName: data.toolName, state: "call", args: data.args }
      : data.phase === "result"
        ? { ...base, state: "result", result: data.result }
        : { ...base, state: "error", result: data.error, isError: true };
  if (idx < 0) return [...tools, next];
  return tools.map((t, i) => (i === idx ? next : t));
}

export function applyProgressEvent(tools: ToolActivityItem[], data: ProgressData): ToolActivityItem[] {
  if (data.source === "gateway") {
    return [...tools, { toolCallId: `gateway-${tools.length}`, toolName: "gateway", state: "result", result: data, isError: data.outcome === "blocked" }];
  }
  if (data.source || !data.stepId) return tools;
  const toolCallId = `progress-${data.stepId}`;
  const next: ToolActivityItem = { toolCallId, toolName: `workflow_step_${data.stepId}`, state: data.phase === "start" ? "call" : "result", result: data.status };
  const idx = tools.findIndex((t) => t.toolCallId === toolCallId);
  return idx < 0 ? [...tools, next] : tools.map((t, i) => (i === idx ? next : t));
}
