import { AgentIcon } from "@/shared/icons/agentIcons.tsx";
import { cn } from "@/shared/lib/cn.ts";
import { gateNumberLabel, type PipelineStage } from "@/shared/lib/pipeline.ts";

export function StageNode({ stage, state, onSelect }: { stage: PipelineStage; state: "active" | "passed" | "next"; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={state === "active" ? "step" : undefined}
      className={cn(
        "flex flex-col items-center rounded-xl p-3 text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        state === "active" && "border-2 border-brand bg-brand-soft/30 shadow-md",
        state === "passed" && "border border-line bg-surface hover:border-brand/40",
        state === "next" && "border border-line/60 bg-canvas opacity-75 hover:opacity-100",
      )}
    >
      <AgentIcon agentId={stage.agentId} className="size-10" />
      <span className="mt-2 text-xs font-bold text-ink-900">{gateNumberLabel(stage.gate)}</span>
      <span className="mt-0.5 text-[11px] font-semibold text-brand-navy">{stage.short}</span>
      <span className="mt-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] font-medium text-ink-600">{stage.surface === "vscode" ? "VS Code" : "Web app"}</span>
    </button>
  );
}
