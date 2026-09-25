import { useState } from "react";
import type { RunStep } from "../../../types/api.ts";
import { formatDateTime } from "../../../shared/lib/format.ts";
import { cn } from "../../../shared/lib/cn.ts";
import { ChevronRightIcon } from "../../../shared/icons/index.tsx";
import { councilTurnTitle, formatCouncilTurn, type CouncilTurnEvent } from "../../../shared/lib/council.ts";

const AGENT_NAMES: Record<string, string> = {
  po: "PO Agent",
  "po-agent": "PO Agent",
  ba: "BA Agent",
  "ba-agent": "BA Agent",
  architect: "Architect Agent",
  "architect-agent": "Architect Agent",
  dev: "Dev Agent",
  "dev-agent": "Dev Agent",
  code: "Coding Agent",
  "coding-agent": "Coding Agent",
};

// Step ids from apps/agent-runtime/src/mastra/workflows/architect-workflow.ts.
const ARCHITECT_STEP_NAMES: Record<string, string> = {
  "requirements-analysis": "Requirements analysis",
  "system-decomposition": "System decomposition",
  "api-design": "API design",
  "data-design": "Data design",
  "security-design": "Security design",
  "ai-design": "AI design",
  "deployment-testing": "Deployment and testing notes",
  assemble: "ADRs and tasks",
};

function label(step: RunStep): { title: string; tone: "neutral" | "success" | "warning" | "danger" } {
  const tool = step.toolName ?? "";
  const agent = tool.startsWith("delegate_to_") ? (AGENT_NAMES[tool.slice(12)] ?? `${tool.slice(12)} agent`) : null;
  switch (step.kind) {
    case "progress": {
      const source = step.payload?.source;
      if (source === "council") {
        const turn = step.payload as unknown as CouncilTurnEvent;
        const tone = turn.status === "error" || turn.verdict === "CHANGES" ? (turn.status === "error" ? "danger" : "warning") : turn.verdict === "APPROVE" ? "success" : "neutral";
        return { title: councilTurnTitle(turn), tone };
      }
      if (source === "dev" || source === "code") {
        return { title: `${source === "dev" ? "Dev Agent" : "Coding Agent"} output`, tone: "neutral" };
      }
      const stepId = typeof step.payload?.stepId === "string" ? step.payload.stepId : "";
      const phase = typeof step.payload?.phase === "string" ? step.payload.phase : "";
      const stepLabel = ARCHITECT_STEP_NAMES[stepId] ?? stepId;
      return { title: `Architect: ${stepLabel}${phase === "start" ? "..." : " done"}`, tone: "neutral" };
    }
    case "tool-call":
      return { title: agent ? `Orchestrator delegated to ${agent}` : `Called ${tool}`, tone: "neutral" };
    case "tool-result": {
      const ok = (step.payload?.result as { ok?: boolean } | undefined)?.ok;
      return { title: agent ? `${agent} ${ok === false ? "failed" : "responded"}` : `${tool} returned`, tone: ok === false ? "danger" : "success" };
    }
    case "tool-error":
      return { title: `${tool} failed`, tone: "danger" };
    case "suspended":
      return { title: "Paused for a human decision", tone: "warning" };
    case "resumed":
      return { title: `Resumed with a ${String(step.payload?.role ?? "human").replace("_", " ")} decision`, tone: "success" };
    case "text":
      return { title: "Orchestrator replied", tone: "neutral" };
    case "error":
      return { title: "Run failed", tone: "danger" };
    case "finish":
      return { title: "Turn finished", tone: "success" };
  }
}

const dot: Record<string, string> = {
  neutral: "bg-ink-300",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

function payloadText(step: RunStep): string | null {
  if (!step.payload) return null;
  const p = step.payload as Record<string, unknown>;
  if (p.source === "council") return formatCouncilTurn(p as unknown as CouncilTurnEvent);
  if (typeof p.chunk === "string") return p.chunk;
  if (typeof p.text === "string") return p.text;
  if (typeof p.message === "string") return p.message;
  if (typeof p.error === "string") return p.error;
  const result = p.result as { result?: unknown } | undefined;
  if (result && typeof result === "object" && typeof result.result === "string") return result.result;
  const args = p.args as { task?: unknown } | undefined;
  if (args && typeof args === "object" && typeof args.task === "string") return args.task;
  return JSON.stringify(p, null, 2);
}

function outputSource(step: RunStep): "dev" | "code" | null {
  const source = step.payload?.source;
  return source === "dev" || source === "code" ? source : null;
}

// Each Docker/CLI stdout chunk is its own persisted step - dozens for one Gate 4/5 run.
// Collapses consecutive chunks from the same source into one growing block (same idea as the
// live chat view's coalescing, apps/web/src/features/workspace/hooks/useConversation.ts),
// so the history view reads like a log instead of a wall of near-identical rows.
function groupSteps(steps: RunStep[]): RunStep[] {
  const grouped: RunStep[] = [];
  for (const step of steps) {
    const source = outputSource(step);
    const prev = grouped[grouped.length - 1];
    if (source && prev && outputSource(prev) === source) {
      const prevChunk = typeof prev.payload?.chunk === "string" ? prev.payload.chunk : "";
      const chunk = typeof step.payload?.chunk === "string" ? step.payload.chunk : "";
      grouped[grouped.length - 1] = { ...prev, payload: { ...prev.payload, chunk: prevChunk + chunk }, createdAt: step.createdAt };
      continue;
    }
    grouped.push(step);
  }
  return grouped;
}

export function RunTimeline({ steps: rawSteps }: { steps: RunStep[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  if (rawSteps.length === 0) return <p className="px-5 py-6 text-sm text-ink-500">No steps recorded yet.</p>;
  const steps = groupSteps(rawSteps);

  return (
    <ol className="px-5 py-2">
      {steps.map((step, idx) => {
        const { title, tone } = label(step);
        const detail = payloadText(step);
        const isOpen = open.has(step.id);
        return (
          <li key={step.id} className="relative flex gap-4 py-3">
            {idx < steps.length - 1 ? <span className="absolute left-[5px] top-7 bottom-0 w-px bg-line" aria-hidden /> : null}
            <span className={cn("mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-surface", dot[tone])} />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() =>
                  setOpen((s) => {
                    const n = new Set(s);
                    if (n.has(step.id)) n.delete(step.id);
                    else n.add(step.id);
                    return n;
                  })
                }
                className="flex w-full items-center justify-between gap-3 text-left"
                disabled={!detail}
              >
                <span>
                  <span className="block text-sm font-medium text-ink-900">{title}</span>
                  <span className="block text-xs text-ink-500">{formatDateTime(step.createdAt)}</span>
                </span>
                {detail ? <ChevronRightIcon className={cn("size-4 shrink-0 text-ink-400 transition-transform", isOpen && "rotate-90")} /> : null}
              </button>
              {isOpen && detail ? (
                <pre className="scroll-quiet mt-2 max-h-96 overflow-auto rounded-md border border-line bg-ink-50 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink-700 whitespace-pre-wrap">
                  {detail}
                </pre>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
