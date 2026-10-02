import { AgentIcon } from "../icons/agentIcons.tsx";
import { agentLabel } from "../lib/agents.ts";
import { cn } from "../lib/cn.ts";

export function AgentBadge({ agentId, detail, className }: { agentId: string; detail?: string; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-xs", className)}>
      <AgentIcon agentId={agentId} className="size-4" />
      <span className="truncate font-semibold text-ink-800">{agentLabel(agentId)}</span>
      {detail ? <span className="shrink-0 text-ink-500">{detail}</span> : null}
    </span>
  );
}
