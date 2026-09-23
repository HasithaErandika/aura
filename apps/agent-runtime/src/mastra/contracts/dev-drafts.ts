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
  // The Epic+discipline base repo - scaffolded once by the first Task of that discipline, never
  // edited by an agent again after that. targetDir (below) is what every agent actually works
  // in; baseDir exists so the plan/comment can say where the shared history lives.
  baseDir: z.string().min(1).describe('The Epic+discipline base repo, scaffolded once and shared as history every Task branches from'),
  targetDir: z.string().min(1).describe("This Task's own isolated git worktree - what the Coding Agent, Git tool, and Tester Agent actually operate on"),
  branch: z.string().min(1).describe('This Task\'s own branch (feature/<taskKey>), checked out into targetDir'),
  // True when baseDir was already scaffolded by an earlier Task of this discipline in the same
  // Epic - the scaffold command does NOT run again in that case, only a new worktree is created
  // for this Task ("Concurrent Task Execution" milestone - two Tasks of the same discipline must
  // never share one mutable directory).
  alreadyScaffolded: z.boolean(),
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
    draft.alreadyScaffolded
      ? `**${draft.discipline} is already scaffolded** at \`${draft.baseDir}\` (an earlier Task set it up). This Task gets its own isolated git worktree at \`${draft.targetDir}\` on branch \`${draft.branch}\` - the scaffold command below will NOT run again.`
      : `**Target directory (base repo):** ${draft.baseDir}\n**This Task's worktree:** ${draft.targetDir} on branch \`${draft.branch}\``,
    '',
    '## What will run',
    draft.alreadyScaffolded ? '*(nothing - only the worktree above gets created)*' : draft.commandDescription,
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
      ? draft.alreadyScaffolded
        ? `AURA Dev Agent created an isolated git worktree for this Task (${draft.discipline} was already scaffolded).`
        : `AURA Dev Agent scaffolded ${draft.discipline} for this Task.`
      : `AURA Dev Agent's scaffold for this Task FAILED (exit code ${exitCode}).`,
    '',
    `Task worktree: ${draft.targetDir} (branch ${draft.branch})`,
    `Base repo: ${draft.baseDir}`,
    `Command: ${draft.commandDescription}`,
  ];
  if (exitCode !== 0 && outputTail.trim()) {
    lines.push('', '## Last output', '```', outputTail.trim().slice(-1500), '```');
  }
  lines.push('', '----', stamp);
  return lines.join('\n');
}
