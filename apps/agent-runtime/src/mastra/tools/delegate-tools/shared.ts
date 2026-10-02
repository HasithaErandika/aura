import { z } from 'zod';
import type { DraftRecord } from '../../store/draft-store';
import { scaffoldDisciplines } from '../../contracts/dev-drafts';
import { AGENT_MANIFEST, type AgentId } from '../../agents/registry';

// Helpers shared across every delegate_to_* tool (one file per gate in this directory - see
// index.ts). Nothing here is gate-specific; a helper only lives here if at least two gates use it.

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

// Committer identity for AURA's own git commits (dev.ts's initial scaffold chore commit, and the
// committer of git.ts's and the council's human-approved commits - see commitIdentity) - passed as
// -c flags rather than relying on the host's global git config, which a fresh machine or CI runner
// may not have set. Not a real person: scaffold commits are code-authored, not a human's.
export const AURA_GIT_IDENTITY = ['-c', 'user.name=AURA', '-c', 'user.email=aura@localhost'];

// The human whose approval resumed this run. apps/api resolves it server-side from the approval
// decision (approvals.service.ts) and sends it as requestContext on the resume - never taken from
// the model or the request body. gitName/gitEmail are the profile's git identity, null when unset.
export interface Approver {
  userId: string;
  role: string;
  name: string | null;
  email: string | null;
  gitName: string | null;
  gitEmail: string | null;
}

export const APPROVER_CONTEXT_KEY = 'auraApprover';

interface RequestContextLike {
  get: (key: string) => unknown;
}

export function approverFrom(requestContext: RequestContextLike | undefined): Approver | null {
  const value = requestContext?.get(APPROVER_CONTEXT_KEY) as Partial<Approver> | undefined;
  if (!value || typeof value !== 'object' || typeof value.userId !== 'string') return null;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return { userId: value.userId, role: text(value.role) ?? 'unknown', name: text(value.name), email: text(value.email), gitName: text(value.gitName), gitEmail: text(value.gitEmail) };
}

// Server-side commit identity: the approver authors when known, else AURA with an Approved-by trailer.
export function commitIdentity(approver: Approver | null): { before: string[]; author: string[]; trailers: string[] } {
  if (approver?.gitName && approver.gitEmail) {
    return { before: AURA_GIT_IDENTITY, author: [`--author=${approver.gitName} <${approver.gitEmail}>`], trailers: ['Co-authored-by: AURA <aura@localhost>'] };
  }
  const who = approver ? [approver.name ?? approver.email ?? approver.userId, approver.email ? `<${approver.email}>` : null].filter(Boolean).join(' ') : null;
  return { before: AURA_GIT_IDENTITY, author: [], trailers: who ? [`Approved-by: ${who}`] : [] };
}

// git commit arguments: identity, message, and Task and run trailers.
export function commitArgs(approver: Approver | null, message: string, trailers: string[], extra: string[] = []): string[] {
  const id = commitIdentity(approver);
  const all = [...id.trailers, ...trailers];
  return [...id.before, 'commit', ...extra, ...id.author, '-m', message, ...(all.length ? ['-m', all.join('\n')] : [])];
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

// Minimal shape of a tool's streaming writer - Architect and QA workflows relay step
// start/result events into it (architect.ts, qa.ts).
export interface ToolWriterLike {
  custom: (chunk: { type: `data-${string}`; data: unknown; transient?: boolean }) => Promise<void>;
}

// Reads the Discipline line that renderArchitectureTask writes into every Task.
export function disciplineFromTask(description: string): (typeof scaffoldDisciplines)[number] | null {
  const match = /\*\*Discipline:\*\*\s*(\w+)/.exec(description);
  const value = match?.[1];
  return value && (scaffoldDisciplines as readonly string[]).includes(value) ? (value as (typeof scaffoldDisciplines)[number]) : null;
}
