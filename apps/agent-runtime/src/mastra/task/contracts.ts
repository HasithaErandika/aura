import { z } from 'zod';
import { bullets } from '../contracts/markdown';

// A Task worked on in VS Code (docs/ARCHITECTURE.md §4.1): the plan the developer
// approves at Gate 4, the coder ↔ Evaluator rounds, and the review they approve at Gate 5. The
// agents propose these shapes; the code around them (router.ts, loop.ts, tools/task-tools.ts)
// decides who codes, which checks run, and whether a round passed.

export const CODERS = ['frontend-react', 'backend-nestjs', 'backend-spring', 'issue-solver', 'test-writer'] as const;
export type CoderId = (typeof CODERS)[number];

export const planStepSchema = z.object({
  title: z.string().min(3).max(200).describe('One step, starting with a verb'),
  detail: z.string().max(2000).default('').describe('What changes and why, briefly'),
  files: z.array(z.string().min(1)).max(40).default([]).describe('Files this step creates or changes, relative to the workspace'),
});
export type PlanStep = z.infer<typeof planStepSchema>;

// A part of the plan one coder does in parallel with the others (V5), on its own sub-branch and
// worktree. Scopes must not overlap; code checks that (task/split.ts).
export const subtaskSchema = z.object({
  title: z.string().min(3).max(200),
  steps: z.array(z.number().int().min(1)).min(1).max(20).describe('The plan step numbers (1-based) this part does'),
  scope: z.array(z.string().min(1).max(300)).min(1).max(20).describe('Files or folders this part alone may change, e.g. "apps/web/src/features/tickets"'),
});
export type SubtaskPlan = z.infer<typeof subtaskSchema>;

export const taskPlanSchema = z.object({
  summary: z.string().min(10).max(2000).describe('What the Task needs and how you will do it, in two or three sentences'),
  steps: z.array(planStepSchema).min(1).max(20),
  checks: z.array(z.string().min(1).max(300)).max(10).default([]).describe('Commands that prove the change works, e.g. "npm test", "npm run lint"'),
  risks: z.array(z.string().min(1).max(500)).max(10).default([]),
  subtasks: z
    .array(subtaskSchema)
    .max(4)
    .default([])
    .describe('Leave empty for one coder. Only when the work splits into 2-4 parts that change disjoint files (e.g. API and web), list them: every step in exactly one part'),
});
export type TaskPlan = z.infer<typeof taskPlanSchema>;

export interface TaskInfo {
  taskKey: string;
  epicKey: string | null;
  summary: string;
  description: string;
  issueType: string;
  discipline: string | null;
  labels: string[];
}

export interface Route {
  coder: CoderId;
  reason: string;
}

// The Gate 4 draft (draft kind "task-plan").
// A parallel part as code resolved it: its coder (by file scope), sub-branch and worktree.
export interface Subtask {
  n: number;
  title: string;
  steps: number[];
  scope: string[];
  coder: CoderId;
  branch: string;
  worktree: string;
}

export interface TaskPlanDraft {
  task: TaskInfo;
  route: Route;
  plan: TaskPlan;
  // feat/<EPIC>/<TASK>, created after Gate 4 (V5; older drafts have none).
  branch?: string;
  subtasks?: Subtask[];
}

export const findingSchema = z.object({
  severity: z.enum(['blocker', 'major', 'minor']),
  file: z.string().nullable().default(null),
  message: z.string().min(3).max(2000),
});
export type Finding = z.infer<typeof findingSchema>;

export const evaluatorVerdictSchema = z.object({
  approved: z.boolean().describe('true only if the change does what the plan says and you found no blocker or major problem'),
  summary: z.string().min(3).max(2000),
  findings: z.array(findingSchema).max(30).default([]),
});
export type EvaluatorVerdict = z.infer<typeof evaluatorVerdictSchema>;

export interface CheckResult {
  command: string;
  exitCode: number;
  passed: boolean;
  output: string;
}

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
}

export interface Round {
  round: number;
  coderSummary: string;
  checks: CheckResult[];
  verdict: EvaluatorVerdict;
  passed: boolean;
}

export type MergeOutcome = 'clean' | 'resolved' | 'failed' | 'skipped' | 'empty';

// One parallel part's result (V5).
export interface SubtaskResult {
  n: number;
  title: string;
  coder: CoderId;
  branch: string;
  rounds: number;
  passed: boolean;
  merge: MergeOutcome;
  summary: string;
}

// The Gate 5 draft (draft kind "task-review").
export interface TaskReviewDraft {
  planDraftId: string;
  taskKey: string;
  coder: CoderId;
  rounds: Round[];
  passed: boolean;
  changedFiles: ChangedFile[];
  diffStat: string;
  // The Task branch and the commit the change is compared with (V5).
  branch?: string;
  baseRef?: string;
  subtasks?: SubtaskResult[];
}

// A round passes when every check is green, the Evaluator approves, and no blocker or major finding remains.
export function roundPassed(verdict: EvaluatorVerdict, checks: CheckResult[]): boolean {
  return verdict.approved && checks.every((c) => c.passed) && !verdict.findings.some((f) => f.severity !== 'minor');
}

export function renderPlan(draft: TaskPlanDraft): string {
  const { task, route, plan } = draft;
  return [
    `# Plan for ${task.taskKey}: ${task.summary}`,
    '',
    `**Coder:** ${route.coder} (${route.reason})${task.epicKey ? ` · **Epic:** ${task.epicKey}` : ''}`,
    '',
    plan.summary,
    '',
    '## Steps',
    '',
    plan.steps.map((s, i) => `${i + 1}. **${s.title}**${s.detail ? ` ${s.detail}` : ''}${s.files.length ? `\n   Files: ${s.files.map((f) => `\`${f}\``).join(', ')}` : ''}`).join('\n'),
    '',
    '## Checks',
    bullets(plan.checks.map((c) => `\`${c}\``)),
    ...(plan.risks.length ? ['', '## Risks', bullets(plan.risks)] : []),
    ...(draft.subtasks?.length
      ? ['', '## Parallel parts', 'Each part runs on its own sub-branch and worktree, then AURA merges them into the Task branch.', '', draft.subtasks.map((s) => `${s.n}. **${s.title}** (${s.coder}, steps ${s.steps.join(', ')})\n   Owns: ${s.scope.map((f) => `\`${f}\``).join(', ')}`).join('\n')]
      : []),
  ].join('\n');
}

export function renderReview(draft: TaskReviewDraft): string {
  const last = draft.rounds.at(-1);
  const outcome = draft.passed
    ? `The Evaluator approved the change after ${draft.rounds.length} round${draft.rounds.length === 1 ? '' : 's'}, and every check passed.`
    : `Not approved after ${draft.rounds.length} round${draft.rounds.length === 1 ? '' : 's'}: review the open findings before accepting.`;
  return [
    `# Code review for ${draft.taskKey}`,
    '',
    outcome,
    '',
    `**Coder:** ${draft.coder}${draft.branch ? ` · **Branch:** \`${draft.branch}\`` : ''}`,
    ...(draft.subtasks?.length
      ? ['', '## Parallel parts', bullets(draft.subtasks.map((s) => `${s.passed ? '✅' : '❌'} ${s.title} (${s.coder}, \`${s.branch}\`): ${s.rounds} round(s), merge ${s.merge}`))]
      : []),
    '',
    '## Changed files',
    bullets(draft.changedFiles.map((f) => `\`${f.path}\` (${f.status})`)),
    ...(draft.diffStat ? ['', '```', draft.diffStat.trim(), '```'] : []),
    '',
    '## Checks',
    bullets((last?.checks ?? []).map((c) => `${c.passed ? '✅' : '❌'} \`${c.command}\` (exit ${c.exitCode})`)),
    '',
    '## Evaluator',
    last?.verdict.summary ?? 'No review ran.',
    ...(last?.verdict.findings.length ? ['', bullets(last.verdict.findings.map((f) => `**${f.severity}**${f.file ? ` \`${f.file}\`` : ''}: ${f.message}`))] : []),
  ].join('\n');
}
