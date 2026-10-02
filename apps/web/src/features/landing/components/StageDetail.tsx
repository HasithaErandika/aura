import { CheckIcon, GateIcon } from "@/shared/icons/index.tsx";
import { gateNumberLabel, type PipelineStage } from "@/shared/lib/pipeline.ts";
import { STAGE_DETAILS } from "../lib/content.ts";

export function StageDetail({ stage }: { stage: PipelineStage }) {
  const detail = STAGE_DETAILS[stage.key];
  return (
    <div className="rounded-xl border border-line bg-canvas p-4 sm:p-6" aria-live="polite">
      <p className="text-xs font-semibold text-brand uppercase">{stage.surface === "vscode" ? "In VS Code" : "In the web app"}</p>
      <h4 className="mt-1 text-lg font-bold text-ink-900">
        {gateNumberLabel(stage.gate)}: {stage.agentLabel}
      </h4>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <p className="text-sm leading-relaxed font-medium text-ink-800">{detail?.objective}</p>
          <ul className="flex flex-wrap gap-2">
            {detail?.outputs.map((out) => (
              <li key={out} className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-700">
                <CheckIcon className="size-3 text-brand" aria-hidden />
                {out}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-brand/30 bg-brand-soft/40 p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-brand">
            <GateIcon className="size-4" aria-hidden />
            Human approval: {stage.name}
          </p>
          <p className="mt-1 text-xs text-ink-600">
            Approver: <strong className="text-ink-900">{detail?.approver}</strong>. Nothing continues until they decide.
          </p>
        </div>
      </div>
    </div>
  );
}
