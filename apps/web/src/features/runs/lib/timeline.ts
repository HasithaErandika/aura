import { agentLabel } from "@/shared/lib/agents.ts";
import { gatewayDetail, gatewaySummary, isDelegateTool, toolLabel, type GatewayEvent } from "@/shared/lib/gateway.ts";
import { formatNumber } from "@/shared/lib/format.ts";
import { taskProgressTitle, workflowStepTitle, type TaskProgress } from "@/shared/lib/progress.ts";
import { roleLabel } from "@/shared/lib/roles.ts";
import type { StateTone } from "@/shared/lib/tone.ts";
import type { RunStep } from "../types.ts";

export interface TimelineEntry {
  id: number;
  title: string;
  tone: StateTone;
  detail: string | null;
  createdAt: string;
  count: number;
}

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

function isTaskStep(step: RunStep): boolean {
  return step.kind === "progress" && step.payload?.source === "task" && step.payload?.kind === "step";
}

function progressTitle(p: Record<string, unknown>): { title: string; tone: StateTone } {
  if (p.source === "gateway") return gatewaySummary(p as GatewayEvent);
  if (p.source === "task") {
    const task = p as TaskProgress;
    return { title: taskProgressTitle(task), tone: task.passed === false ? "warning" : "neutral" };
  }
  if (p.source === "draft") {
    const chars = typeof p.chars === "number" ? p.chars : 0;
    return { title: `${toolLabel(str(p.tool))} draft shown for review (${formatNumber(chars)} characters)`, tone: "neutral" };
  }
  return { title: workflowStepTitle(str(p.stepId) ?? "step", str(p.phase) ?? undefined), tone: "neutral" };
}

function stepTitle(step: RunStep): { title: string; tone: StateTone } {
  const tool = step.toolName ?? "";
  const delegate = isDelegateTool(tool) ? toolLabel(tool) : null;
  switch (step.kind) {
    case "progress":
      return progressTitle(step.payload ?? {});
    case "tool-call":
      if (tool === "ask_user") return { title: "Asked for a human decision", tone: "neutral" };
      return { title: delegate ? `Orchestrator delegated to ${delegate}` : `Called ${tool}`, tone: "neutral" };
    case "tool-result": {
      const ok = (step.payload?.result as { ok?: boolean } | undefined)?.ok !== false;
      return { title: delegate ? `${delegate} ${ok ? "responded" : "failed"}` : `${tool} returned`, tone: ok ? "success" : "danger" };
    }
    case "tool-error":
      return { title: `${delegate ?? tool} failed`, tone: "danger" };
    case "suspended":
      return { title: "Paused for a human decision", tone: "warning" };
    case "resumed":
      return { title: `Resumed with a ${roleLabel(str(step.payload?.role) ?? "requester")} decision`, tone: "success" };
    case "text":
      return { title: `${agentLabel(str(step.payload?.agent))} replied`, tone: "neutral" };
    case "error":
      return { title: "Run failed", tone: "danger" };
    case "finish":
      return { title: "Turn finished", tone: "success" };
  }
}

export function stepDetail(step: RunStep): string | null {
  const p = step.payload;
  if (!p) return null;
  if (p.source === "gateway") return gatewayDetail(p as GatewayEvent) || null;
  if (p.source === "draft" || (step.kind === "progress" && p.source !== "task")) return null;
  for (const key of ["chunk", "text", "message", "error", "summary"]) {
    const value = str(p[key]);
    if (value) return value;
  }
  const result = str((p.result as { result?: unknown } | undefined)?.result);
  if (result) return result;
  const task = str((p.args as { task?: unknown } | undefined)?.task);
  if (task) return task;
  if (step.kind === "progress" || step.kind === "finish" || step.kind === "suspended") return null;
  return JSON.stringify(p, null, 2);
}

export function buildTimeline(steps: RunStep[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let previous: RunStep | null = null;
  for (const step of steps) {
    const last = entries[entries.length - 1];
    if (last && previous && isTaskStep(step) && isTaskStep(previous)) {
      last.count += 1;
      last.title = `Coder worked through ${last.count} steps`;
      last.createdAt = step.createdAt;
    } else {
      entries.push({ id: step.id, ...stepTitle(step), detail: stepDetail(step), createdAt: step.createdAt, count: 1 });
    }
    previous = step;
  }
  return entries;
}
