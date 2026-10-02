import { gateNumberLabel } from "@/shared/lib/pipeline.ts";
import type { Tone } from "@/shared/lib/tone.ts";
import { Badge } from "@/shared/ui/Badge.tsx";
import { SectionTitle } from "@/shared/ui/SectionTitle.tsx";
import type { StageProgress, StageState } from "../lib/pipeline.ts";

const TONE: Record<StageState, Tone> = { done: "success", pending: "outline", vscode: "neutral" };
const LABEL: Record<StageState, string> = { done: "done", pending: "pending", vscode: "runs in VS Code" };

export function PipelineTracker({ stages }: { stages: StageProgress[] }) {
  if (stages.length === 0) return null;
  return (
    <div>
      <SectionTitle>Pipeline</SectionTitle>
      <ol className="flex flex-wrap items-center gap-1.5">
        {stages.map((stage) => (
          <li key={stage.key} title={`${stage.agentLabel}: ${LABEL[stage.state]}`}>
            <Badge tone={TONE[stage.state]} dot={stage.state === "done"}>
              {gateNumberLabel(stage.gate, "QA")} · {stage.short}
              {stage.surface === "vscode" ? " · VS Code" : ""}
              <span className="sr-only">, {LABEL[stage.state]}</span>
            </Badge>
          </li>
        ))}
      </ol>
      <p className="mt-1.5 text-[11px] text-ink-400">Read from the AURA stamp in this issue's comments. VS Code stages report on the QA page.</p>
    </div>
  );
}
