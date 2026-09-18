import { z } from 'zod';

// The Dev agent's scaffold plan. Unlike epic/story/architecture drafts, almost nothing here is
// model-authored: discipline, targetDir, and commandDescription are all fixed by code
// (tools/delegate-tools.ts's SCAFFOLD_COMMANDS, per docs/adr/0001-dev-agent-scaffold-and-
// template-strategy.md) before the agent ever runs. The agent contributes only `summary` - why
// this scaffold fits the Task - the same "agents propose, deterministic systems decide" split
// as everywhere else, taken further: here the model doesn't even propose the action, only
// explains it.

export const scaffoldDisciplines = ['Frontend', 'Backend', 'Data', 'AI', 'Integration'] as const;
export type ScaffoldDiscipline = (typeof scaffoldDisciplines)[number];

export const devScaffoldDraftSchema = z.object({
  epicKey: z.string().min(1),
  taskKey: z.string().min(1),
  discipline: z.enum(scaffoldDisciplines),
  targetDir: z.string().min(1).describe('Host path the scaffold will be written into'),
  image: z.string().min(1).describe('Docker image the scaffold command runs in'),
  command: z.string().min(1).describe('Fixed shell command that runs inside the container - resolved once at draft time, not re-derived at execute time'),
  commandDescription: z.string().min(1).describe('Fixed, human-readable description of exactly what will run'),
  summary: z.string().min(10).describe('Why this scaffold matches the Task, from an implementer perspective'),
});
export type DevScaffoldDraft = z.infer<typeof devScaffoldDraftSchema>;

const DEV_PERSPECTIVE = '*Drafted by the AURA Dev Agent, from an implementation-readiness perspective: what gets scaffolded, where, and why - the commands themselves are fixed by AURA, not chosen by this agent.*';

export function renderDevScaffoldPlan(draft: DevScaffoldDraft): string {
  return [
    `# Dev scaffold plan for ${draft.taskKey} (${draft.epicKey})`,
    '',
    DEV_PERSPECTIVE,
    '',
    `**Discipline:** ${draft.discipline}`,
    `**Target directory:** ${draft.targetDir}`,
    '',
    '## What will run',
    draft.commandDescription,
    '',
    '## Why this matches the Task',
    draft.summary,
  ].join('\n');
}

// Renders the Jira comment posted on the Task after a scaffold attempt, success or failure -
// includes the exact command that ran and, on failure, a short output tail, so a teammate
// reading Jira (who may not have AURA open) can see what happened without leaving Jira.
export function devScaffoldFiledComment(draft: DevScaffoldDraft, exitCode: number, outputTail: string, stamp: string): string {
  const lines = [
    exitCode === 0
      ? `AURA Dev Agent scaffolded ${draft.discipline} for this Task.`
      : `AURA Dev Agent's scaffold for this Task FAILED (exit code ${exitCode}).`,
    '',
    `Local path: ${draft.targetDir}`,
    `Command: ${draft.commandDescription}`,
  ];
  if (exitCode !== 0 && outputTail.trim()) {
    lines.push('', '## Last output', '```', outputTail.trim().slice(-1500), '```');
  }
  lines.push('', '----', stamp);
  return lines.join('\n');
}
