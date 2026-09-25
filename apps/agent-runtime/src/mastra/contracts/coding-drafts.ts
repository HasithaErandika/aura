import { z } from 'zod';
import { scaffoldDisciplines } from './dev-drafts';

// The Coding Agent's plan (Gate 5). The draft itself is never model-authored, for any
// provider: `prompt` is built deterministically from the Task's own Jira content by
// delegate-tools.ts. What differs per provider is *who does the actual implementation* -
// "mastra" (AURA's own built-in agent, agents/mastra-coding-agent.ts, three file tools) is the
// main option and always available; Claude Code / Codex are external CLIs a human can pick
// instead, authenticated via their own CLI login on the machine running agent-runtime
// (`claude login` / `codex login` - not an API key), run in Docker via
// delegate-tools.ts's CODING_COMMANDS.

export const codingProviders = ['anthropic', 'openai', 'mastra', 'council'] as const;
export type CodingProvider = (typeof codingProviders)[number];

export const codingProviderLabel: Record<CodingProvider, string> = {
  anthropic: 'Claude Code',
  openai: 'Codex',
  mastra: 'AURA Coding Agent',
  council: 'AURA Coding Council',
};

// Providers that run inside agent-runtime itself on AURA's own configured models - no external
// CLI login, no Docker.
export const builtInCodingProviders: readonly CodingProvider[] = ['mastra', 'council'];

export const codingTaskDraftSchema = z.object({
  epicKey: z.string().min(1),
  taskKey: z.string().min(1),
  discipline: z.enum(scaffoldDisciplines),
  targetDir: z.string().min(1).describe('Host path of the already-scaffolded project the coding agent will edit'),
  provider: z.enum(codingProviders),
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
    `**Coding agent:** ${codingProviderLabel[draft.provider]}${draft.provider === 'council' ? ' (Planner, Implementer and Reviewer agents discuss the work, built-in)' : builtInCodingProviders.includes(draft.provider) ? ' (built-in, always available)' : ' (your own CLI login on this machine)'}`,
    `**Directory:** ${draft.targetDir}`,
    '',
    '## Exact prompt it will receive',
    '```',
    draft.prompt,
    '```',
  ].join('\n');
}

// Renders the Jira comment posted on the Task after a coding-agent run, success or failure.
export function codingFiledComment(draft: CodingTaskDraft, exitCode: number, outputTail: string, stamp: string): string {
  const label = codingProviderLabel[draft.provider];
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
