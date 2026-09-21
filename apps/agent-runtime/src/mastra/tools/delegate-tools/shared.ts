import { z } from 'zod';
import type { DraftRecord } from '../../store/draft-store';
import { scaffoldDisciplines } from '../../contracts/dev-drafts';

// Helpers shared across every delegate_to_* tool (one file per gate in this directory - see
// index.ts). Nothing here is gate-specific; a helper only lives here if at least two gates use it.

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

// Builds the "Created by / Source / Filed" provenance stamp appended to filed Jira content.
export function provenance(agentLabel: string, modelId: string, draft: DraftRecord, source: string): string {
  return [
    `Created by: AURA · ${agentLabel} · ${modelId} · draft ${draft.id} v${draft.version}`,
    `Source: ${source}`,
    `Filed: ${new Date().toISOString()} (human-approved via the AURA Orchestrator)`,
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
