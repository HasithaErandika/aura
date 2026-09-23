import type { JiraComment } from "../../types/api.ts";
import { Badge, type Tone } from "../../shared/ui/Badge.tsx";

// Visualizes where a Jira issue actually sits in AURA's gate pipeline (docs/ARCHITECTURE.md
// section 2.3), derived entirely from data already on screen - no new endpoint. Every gate's
// output carries a uniform provenance stamp ("Created by: AURA · <Agent Label> v..." -
// tools/delegate-tools/shared.ts's provenance()) in whatever it comments or files, so scanning
// an issue's own comments for that stamp tells you, honestly, which gates have actually produced
// something for THIS issue - not which gates exist in the abstract.
//
// Epics and Tasks see different gates because different agents comment on different issue types:
// PO/BA/Architect/QA/Deployer comment on the Epic; Dev/Coding/Tester comment on the Task. A
// Story/Bug owns no gate itself, so it gets no tracker.

interface GateDef {
  gate: number;
  label: string;
  agentLabel: string;
}

const EPIC_GATES: GateDef[] = [
  { gate: 1, label: "PO", agentLabel: "PO Agent" },
  { gate: 2, label: "BA", agentLabel: "BA Agent" },
  { gate: 3, label: "Architect", agentLabel: "Architect Agent" },
  { gate: 6, label: "QA", agentLabel: "QA Agent" },
  { gate: 8, label: "Deployer", agentLabel: "Deployer Agent" },
];

const TASK_GATES: GateDef[] = [
  { gate: 4, label: "Dev", agentLabel: "Dev Agent" },
  { gate: 5, label: "Coding", agentLabel: "Coding Agent" },
  { gate: 7, label: "Tester", agentLabel: "Tester Agent" },
];

type GateState = "done" | "halted" | "pending";

function gateState(comments: JiraComment[], agentLabel: string): GateState {
  const matches = comments.filter((c) => c.body.includes(`Created by: AURA · ${agentLabel}`) || c.body.includes(`AURA ${agentLabel}`));
  if (matches.length === 0) return "pending";
  // Gate 7's own halt comment ("HALTED_LOOP_GUARD") is the one case where "an agent commented"
  // does not mean "this gate is done" - it means the Tester loop stopped without passing.
  if (matches.some((c) => c.body.includes("HALTED_LOOP_GUARD"))) return "halted";
  return "done";
}

const STATE_TONE: Record<GateState, Tone> = { done: "success", halted: "danger", pending: "outline" };
const STATE_LABEL: Record<GateState, string> = { done: "done", halted: "halted", pending: "pending" };

export function PipelineTracker({ issueType, comments }: { issueType: string; comments: JiraComment[] }) {
  const gates = issueType.toLowerCase() === "epic" ? EPIC_GATES : issueType.toLowerCase() === "task" ? TASK_GATES : null;
  if (!gates) return null;

  return (
    <div className="border-t border-line pt-3">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-ink-500 uppercase">Pipeline</h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {gates.map((g, i) => {
          const state = gateState(comments, g.agentLabel);
          return (
            <div key={g.gate} className="flex items-center gap-1.5" title={`Gate ${g.gate} — ${STATE_LABEL[state]}`}>
              <Badge tone={STATE_TONE[state]} dot>
                Gate {g.gate} · {g.label}
              </Badge>
              {i < gates.length - 1 ? <span className="text-ink-300">→</span> : null}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-400">Derived from this issue's own Jira comments (AURA's provenance stamp) - not a separate run tracker, so it only ever shows what actually happened here.</p>
    </div>
  );
}
