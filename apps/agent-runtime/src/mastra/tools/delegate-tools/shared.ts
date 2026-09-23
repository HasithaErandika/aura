import { z } from 'zod';
import type { DraftRecord } from '../../store/draft-store';
import { scaffoldDisciplines } from '../../contracts/dev-drafts';
import { AGENT_MANIFEST, type AgentId } from '../../agents/registry';

// Helpers shared across every delegate_to_* tool (one file per gate in this directory - see
// index.ts). Nothing here is gate-specific; a helper only lives here if at least two gates use it.

// Structured form of the provenance stamp below (docs/ARCHITECTURE.md section 5.3: "Full
// provenance stamp (agent version, prompt version, model + version, run/trace ID) on every
// artifact"). Every delegate tool that files or revises a Jira artifact attaches one of these
// to its `provenance` output field, so it survives in run_steps (apps/api mirrors every tool
// result verbatim - orchestration/run-stream.service.ts) independently of the human-readable
// text baked into the Jira description/comment. threadId doubles as the run/trace ID: Mastra
// does not surface its own runId inside a tool's execute context, but threadId is the same
// value apps/api's workflow_runs.thread_id and audit_logs carry, so it is enough to correlate
// an artifact back to the exact run and its approval/audit trail.
export interface ProvenanceStamp {
  agentId: AgentId;
  agentLabel: string;
  agentVersion: string;
  promptVersion: string;
  modelId: string;
  draftId: string;
  draftVersion: number;
  threadId: string | null;
  source: string;
  filedAt: string;
}

// Generic draft/revise/file output shape used by po/ba/architect (dev/code/qa/test/deploy/git
// each define their own narrower schema in their own file, since they return extra fields like
// targetDir/exitCode/passed/failed that don't apply to the others).
export const outputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional().describe('Id of the draft to pass back for revise or file.'),
  markdown: z.string().optional().describe('Human-readable draft. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  epicUrl: z.string().nullable().optional(),
  storyKeys: z.array(z.string()).optional(),
  taskKeys: z.array(z.string()).optional(),
  error: z.string().optional(),
  provenance: z.custom<ProvenanceStamp>().optional(),
});
export type DelegateOutput = z.infer<typeof outputSchema>;

// Converts a caught error into a {ok: false, error} result.
export function fail(error: unknown): DelegateOutput {
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message };
}

// Turns a title into a lowercase, hyphenated, filesystem-safe slug.
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

// Builds the structured provenance record for a filed/revised artifact. modelId is passed
// separately from the manifest's default (rather than always read from AGENT_MANIFEST) because
// a couple of callers report the *actual* model/provider used for this specific run - e.g.
// coding-agent's provider varies per Task (code.ts's codingProviderLabel) even though its
// manifest entry can only describe "varies by provider" in general.
export function buildProvenance(agentId: AgentId, modelId: string, draft: DraftRecord, source: string): ProvenanceStamp {
  const manifest = AGENT_MANIFEST[agentId];
  return {
    agentId,
    agentLabel: manifest.label,
    agentVersion: manifest.agentVersion,
    promptVersion: manifest.promptVersion,
    modelId,
    draftId: draft.id,
    draftVersion: draft.version,
    threadId: draft.threadId,
    source,
    filedAt: new Date().toISOString(),
  };
}

// Renders the "Created by / Source / Trace / Filed" provenance stamp appended to filed Jira
// content - the human-readable form of buildProvenance's structured record.
export function provenance(agentId: AgentId, modelId: string, draft: DraftRecord, source: string): string {
  const stamp = buildProvenance(agentId, modelId, draft, source);
  return [
    `Created by: AURA · ${stamp.agentLabel} v${stamp.agentVersion} (prompt v${stamp.promptVersion}) · ${stamp.modelId} · draft ${stamp.draftId} v${stamp.draftVersion}`,
    `Source: ${source}`,
    `Trace: thread ${stamp.threadId ?? 'n/a'}`,
    `Filed: ${stamp.filedAt} (human-approved via the AURA Orchestrator)`,
  ].join('\n');
}

// Minimal shape of a tool's streaming writer - Architect and QA workflows relay step
// start/result events into it (architect.ts, qa.ts).
export interface ToolWriterLike {
  custom: (chunk: { type: `data-${string}`; data: unknown; transient?: boolean }) => Promise<void>;
}

// Architecture Tasks always render "**Discipline:** X" in this exact form
// (contracts/drafts.ts's renderArchitectureTask) - AURA's own deterministic formatting, not
// free human prose, so parsing it back out here is reliable rather than fragile. Used by
// dev.ts, code.ts, test.ts, and git.ts - every gate that operates on an already-filed Task.
export function disciplineFromTask(description: string): (typeof scaffoldDisciplines)[number] | null {
  const match = /\*\*Discipline:\*\*\s*(\w+)/.exec(description);
  const value = match?.[1];
  return value && (scaffoldDisciplines as readonly string[]).includes(value) ? (value as (typeof scaffoldDisciplines)[number]) : null;
}
