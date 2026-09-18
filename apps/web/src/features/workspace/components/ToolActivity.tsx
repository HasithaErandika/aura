import { useState } from "react";
import type { ChatToolActivity } from "../../../types/api.ts";
import { cn } from "../../../shared/lib/cn.ts";
import { ChevronRightIcon } from "../../../shared/icons/index.tsx";
import { Spinner } from "../../../shared/ui/Spinner.tsx";

const AGENT_NAMES: Record<string, string> = {
  po: "PO Agent",
  "po-agent": "PO Agent",
  ba: "BA Agent",
  "ba-agent": "BA Agent",
  architect: "Architect Agent",
  "architect-agent": "Architect Agent",
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

function describe(tool: ChatToolActivity): { title: string; detail: string | null } {
  const name = tool.toolName;
  if (name.startsWith("architect_step_")) {
    const stepId = name.slice("architect_step_".length);
    const label = ARCHITECT_STEP_NAMES[stepId] ?? stepId;
    return { title: `Architect: ${label}${tool.state === "call" ? "..." : " done"}`, detail: null };
  }
  if (name.startsWith("delegate_to_")) {
    const agent = name.slice("delegate_to_".length);
    const label = AGENT_NAMES[agent] ?? `${agent} agent`;
    const task = typeof (tool.args as { task?: unknown } | undefined)?.task === "string" ? ((tool.args as { task: string }).task as string) : null;
    const mode = task ? /MODE\s*\d+\s*-\s*(\w+)/i.exec(task)?.[1] : null;
    if (tool.state === "call") return { title: `Delegating to ${label}${mode ? ` (${mode.toLowerCase()})` : ""}`, detail: null };
    const result = tool.result as { ok?: boolean; result?: string } | undefined;
    if (result && typeof result === "object" && "ok" in result) {
      return { title: `${label} ${result.ok ? "responded" : "failed"}${mode ? ` (${mode.toLowerCase()})` : ""}`, detail: typeof result.result === "string" ? result.result : null };
    }
    return { title: `${label} responded`, detail: null };
  }
  if (name === "ask_user") return { title: "Asked for a human decision", detail: null };
  return { title: tool.state === "call" ? `Calling ${name}` : `${name} finished`, detail: null };
}

export function ToolActivity({ tool }: { tool: ChatToolActivity }) {
  const [open, setOpen] = useState(false);
  const { title, detail } = describe(tool);
  const pending = tool.state === "call";
  const failed = tool.isError || tool.state === "error";
  const hasDetail = Boolean(detail) || (tool.result !== undefined && tool.result !== null && !detail);

  return (
    <div className={cn("rounded-md border text-xs", failed ? "border-danger/20 bg-danger-soft" : "border-line bg-ink-50")}>
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={cn("flex w-full items-center gap-2 px-3 py-2 text-left", hasDetail ? "cursor-pointer" : "cursor-default")}
      >
        {pending ? <Spinner size="sm" /> : <span className={cn("size-1.5 rounded-full", failed ? "bg-danger" : "bg-success")} />}
        <span className={cn("font-medium", failed ? "text-danger" : "text-ink-700")}>{title}</span>
        {hasDetail ? <ChevronRightIcon className={cn("ml-auto size-3.5 text-ink-400 transition-transform", open && "rotate-90")} /> : null}
      </button>
      {open && hasDetail ? (
        <pre className="scroll-quiet max-h-72 overflow-auto border-t border-line px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink-700 whitespace-pre-wrap">
          {detail ?? JSON.stringify(tool.result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
