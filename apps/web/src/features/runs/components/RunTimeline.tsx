import { useState } from "react";
import type { RunStep } from "../../../types/api.ts";
import { formatDateTime } from "../../../shared/lib/format.ts";
import { cn } from "../../../shared/lib/cn.ts";
import { ChevronRightIcon } from "../../../shared/icons/index.tsx";

const AGENT_NAMES: Record<string, string> = { po: "PO Agent", "po-agent": "PO Agent", ba: "BA Agent", "ba-agent": "BA Agent" };

function label(step: RunStep): { title: string; tone: "neutral" | "success" | "warning" | "danger" } {
  const tool = step.toolName ?? "";
  const agent = tool.startsWith("delegate_to_") ? (AGENT_NAMES[tool.slice(12)] ?? `${tool.slice(12)} agent`) : null;
  switch (step.kind) {
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
  if (typeof p.text === "string") return p.text;
  if (typeof p.message === "string") return p.message;
  if (typeof p.error === "string") return p.error;
  const result = p.result as { result?: unknown } | undefined;
  if (result && typeof result === "object" && typeof result.result === "string") return result.result;
  const args = p.args as { task?: unknown } | undefined;
  if (args && typeof args === "object" && typeof args.task === "string") return args.task;
  return JSON.stringify(p, null, 2);
}

export function RunTimeline({ steps }: { steps: RunStep[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  if (steps.length === 0) return <p className="px-5 py-6 text-sm text-ink-500">No steps recorded yet.</p>;

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
