import { z } from 'zod';
import type { DraftRecord } from '../../store/draft-store';
import { disciplines } from '../../contracts/drafts';
import { AGENT_MANIFEST, type AgentId } from '../../agents/registry';

// Structured provenance for every filed or revised artifact, kept in run_steps alongside the Jira
// text. threadId doubles as the run id that apps/api and audit_logs carry.
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

// Draft/revise/file output shape shared by the PO, BA and Architect tools.
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

// Structured provenance for a filed artifact; modelId is the model this run actually used.
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

// The provenance stamp appended to filed Jira content.
export function provenance(agentId: AgentId, modelId: string, draft: DraftRecord, source: string): string {
  const stamp = buildProvenance(agentId, modelId, draft, source);
  return [
    `Created by: AURA · ${stamp.agentLabel} v${stamp.agentVersion} (prompt v${stamp.promptVersion}) · ${stamp.modelId} · draft ${stamp.draftId} v${stamp.draftVersion}`,
    `Source: ${source}`,
    `Trace: thread ${stamp.threadId ?? 'n/a'}`,
    `Filed: ${stamp.filedAt} (human-approved via the AURA Orchestrator)`,
  ].join('\n');
}

// Minimal shape of a tool's streaming writer, used to relay workflow steps.
export interface ToolWriterLike {
  custom: (chunk: { type: `data-${string}`; data: unknown; transient?: boolean }) => Promise<void>;
}

// Reads the Discipline line that renderArchitectureTask writes into every Task.
export function disciplineFromTask(description: string): (typeof disciplines)[number] | null {
  const value = /\*\*Discipline:\*\*\s*(\w+)/.exec(description)?.[1];
  return value && (disciplines as readonly string[]).includes(value) ? (value as (typeof disciplines)[number]) : null;
}
