import { z } from 'zod';
import { scaffoldDisciplines } from './dev-drafts';
import { councilModes } from './council';

// The Coding Agent's plan (Gate 5). The draft itself is never model-authored, for any
// provider: `prompt` is built deterministically from the Task's own Jira content by
// delegate-tools/code.ts. The provider decides *who does the implementation*, and both are
// AURA's own agents on models chosen in agents/registry.ts (ADR-3 D6):
//   - "council": the Coding Council (workflows/coding-council.ts) - Implementer and Reviewer with
//     the project's checks, plus a Planner in full mode; the default, and the one to use.
//   - "mastra":  a single built-in agent (agents/mastra-coding-agent.ts) - no review. Kept only as
//     a fallback while lean mode proves itself; used only when a human asks for it by name.

export const codingProviders = ['council', 'mastra'] as const;
export type CodingProvider = (typeof codingProviders)[number];

export const codingProviderLabel: Record<CodingProvider, string> = {
  council: 'AURA Coding Council',
  mastra: 'AURA Coding Agent',
};

export const codingTaskDraftSchema = z.object({
  epicKey: z.string().min(1),
  taskKey: z.string().min(1),
  discipline: z.enum(scaffoldDisciplines),
  targetDir: z.string().min(1).describe('Host path of the already-scaffolded project the coding agent will edit'),
  provider: z.enum(codingProviders),
  // Council only: lean or full, chosen at draft time so the approved plan says which runs.
  councilMode: z.enum(councilModes).optional(),
  councilModeReason: z.string().optional(),
  prompt: z.string().min(1).describe('Exact, deterministic prompt built from the Task - never model-authored'),
});
export type CodingTaskDraft = z.infer<typeof codingTaskDraftSchema>;

const CODING_PERSPECTIVE =
  '*Built entirely from the Task itself, deterministically - no model wrote or chose any of this. delegate_to_code drafts with plain code, not a generation step.*';

export function renderCodingPlan(draft: CodingTaskDraft): string {
  return [
    `# Coding plan for ${draft.taskKey} (${draft.epicKey})`,
    '',
    CODING_PERSPECTIVE,
    '',
    `**Discipline:** ${draft.discipline}`,
    `**Coding agent:** ${codingProviderLabel[draft.provider] ?? draft.provider}${draft.provider === 'council' ? '' : ' (single agent, no review)'}`,
    ...(draft.provider === 'council' ? [`**Council mode:** ${councilModeLine(draft)}`] : []),
    `**Directory:** ${draft.targetDir}`,
    '',
    '## Exact prompt it will receive',
    '```',
    draft.prompt,
    '```',
  ].join('\n');
}

function councilModeLine(draft: CodingTaskDraft): string {
  const mode = draft.councilMode ?? 'full';
  const what = mode === 'lean' ? 'lean - Implementer plans inline, then checks and Reviewer rounds' : 'full - Planner, plan review, Implementer, checks and Reviewer rounds';
  return draft.councilModeReason ? `${what} (${draft.councilModeReason})` : what;
}

// Renders the Jira comment posted on the Task after a coding-agent run, success or failure.
export function codingFiledComment(draft: CodingTaskDraft, exitCode: number, outputTail: string, stamp: string): string {
  const label = codingProviderLabel[draft.provider] ?? draft.provider;
  const lines = [
    exitCode === 0 ? `AURA Coding Agent (${label}) worked on this Task - ready for human review.` : `AURA Coding Agent (${label}) FAILED on this Task (exit code ${exitCode}).`,
    '',
    `Local path: ${draft.targetDir}`,
  ];
  if (outputTail.trim()) {
    lines.push('', '## Output', '```', outputTail.trim().slice(-1500), '```');
  }
  lines.push('', '----', stamp);
  return lines.join('\n');
}
