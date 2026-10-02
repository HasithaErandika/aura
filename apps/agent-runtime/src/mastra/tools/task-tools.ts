import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { ArchitectureDraft } from '../contracts/drafts';
import { draftStore, type DraftRecord } from '../store/draft-store';
import { jira } from '../mcp/jira-client';
import { runFrom } from '../gateway/context';
import { settingsFrom } from '../config/settings';
import { generateObject, type MastraLike } from '../lib/generate-object';
import { bridgeFor } from '../agents/bridge-workspace';
import { untrusted } from '../gateway/untrusted';
import { disciplineFromTask, type ToolWriterLike } from './delegate-tools/shared';
import { evaluatorVerdictSchema, renderPlan, renderReview, taskPlanSchema, type CoderId, type TaskInfo, type TaskPlanDraft, type TaskReviewDraft } from '../task/contracts';
import { routeTask } from '../task/router';
import { evaluatorPrompt, runCoderLoop, type LoopEvent } from '../task/loop';
import { collectChange, projectChecks, runChecks, takeNotes } from '../task/workspace-ops';

// A Task worked on in VS Code, through three gates (docs/plans/aura-vscode-agents.md §3):
//
//   delegate_to_planner  draft/revise (low)   the VS Code agent proposes the plan; code routes it
//                                             to a coder and stores it → ask_user = Gate 4
//   delegate_to_coder    execute (medium)     after Gate 4: the coder ↔ Evaluator loop runs in the
//                                             developer's workspace → ask_user = Gate 5
//                        revise (low)         after a Gate 5 "Revise": the same approved plan, again,
//                                             with the developer's feedback
//   delegate_to_review   accept (medium)      after Gate 5: records the accepted change for the PR
//
// Medium modes go through the tool gateway (gateway/gateway.ts): they run only with approved=true
// and a real, unused human decision. Until a conversation's plan is approved, the VS Code agent's
// own workspace is read-only (planLocked, agents/vscode-agent.ts).

type RequestContextLike = { get: (key: string) => unknown };

interface ToolContext {
  mastra?: unknown;
  agent?: { threadId?: string };
  writer?: ToolWriterLike;
  requestContext?: RequestContextLike;
}

const taskOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the developer, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Shown to the developer in full by AURA. Do not repeat it.'),
  taskKey: z.string().optional(),
  coder: z.string().optional(),
  passed: z.boolean().optional(),
  error: z.string().optional(),
});
type TaskOutput = z.infer<typeof taskOutputSchema>;

function taskFail(error: unknown): TaskOutput {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

async function emit(writer: ToolWriterLike | undefined, data: Record<string, unknown>): Promise<void> {
  try {
    await writer?.custom({ type: 'data-task', data });
  } catch {
    // A closed stream never fails the step.
  }
}

// Gate 4 lock: true while this conversation's latest plan has not been approved.
export async function planLocked(threadId: string | null | undefined): Promise<boolean> {
  if (!threadId) return false;
  const plan = await draftStore.latestByThread('task-plan', threadId);
  return Boolean(plan && !plan.filed.approved);
}

// What the router needs about a Task, from Jira (best effort: without Jira, the key alone).
async function loadTask(taskKey: string): Promise<{ task: TaskInfo; backend: string | null }> {
  let task: TaskInfo = { taskKey, epicKey: null, summary: taskKey, description: '', issueType: 'Task', discipline: null, labels: [] };
  try {
    const issue = await jira.getIssue(taskKey);
    task = {
      taskKey,
      epicKey: issue.parentKey ?? null,
      summary: issue.summary || taskKey,
      description: issue.description,
      issueType: issue.issueType || 'Task',
      discipline: disciplineFromTask(issue.description),
      labels: issue.labels ?? [],
    };
  } catch {
    // Jira unreachable or not configured: route on what we have.
  }
  let backend: string | null = null;
  if (task.epicKey) {
    const designs = await draftStore.listByEpic<ArchitectureDraft>('architecture', task.epicKey, 20).catch(() => []);
    backend = designs.find((d) => d.filed.workspaceWritten)?.content.techStack.backend ?? null;
  }
  return { task, backend };
}

const plannerInputSchema = z
  .object({
    mode: z.enum(['draft', 'revise']),
    taskKey: z.string().optional().describe('draft: the Jira Task (or Bug) key, e.g. KAN-45'),
    draftId: z.string().optional().describe('revise: the plan draftId returned earlier'),
    feedback: z.string().optional().describe('revise: the developer\'s feedback, verbatim'),
    plan: taskPlanSchema.describe('Your plan, after reading the relevant code: summary, steps with the files each changes, the checks that prove it, risks'),
  })
  .strict();

export const delegateToPlannerTool = createTool({
  id: 'delegate_to_planner',
  description:
    "Task plan (Gate 4). draft: taskKey + plan -> AURA routes the Task to a coder and shows the plan to the developer (returns draftId). revise: draftId + feedback + the revised plan. Read the code first; then ask_user to approve the plan (Approve / Revise / Reject). Nothing is changed until it is approved.",
  inputSchema: plannerInputSchema,
  outputSchema: taskOutputSchema,
  execute: async (input, context: ToolContext) => {
    try {
      const threadId = context.agent?.threadId ?? runFrom(context.requestContext)?.threadId ?? null;
      let content: TaskPlanDraft;
      let parentId: string | null = null;
      if (input.mode === 'draft') {
        const taskKey = input.taskKey?.trim().toUpperCase();
        if (!taskKey || !/^[A-Z][A-Z0-9_]*-\d+$/.test(taskKey)) return taskFail('draft needs taskKey, e.g. KAN-45');
        const { task, backend } = await loadTask(taskKey);
        content = { task, route: routeTask({ issueType: task.issueType, discipline: task.discipline, labels: task.labels, backend }), plan: input.plan };
      } else {
        if (!input.draftId || !input.feedback?.trim()) return taskFail('revise needs draftId and feedback');
        const previous = await draftStore.get<TaskPlanDraft>(input.draftId);
        if (!previous || previous.kind !== 'task-plan') return taskFail(`unknown plan ${input.draftId}`);
        content = { ...previous.content, plan: input.plan };
        parentId = previous.id;
      }
      const record = await draftStore.create({ kind: 'task-plan', content, threadId, epicKey: content.task.epicKey, parentId });
      await emit(context.writer, { kind: 'plan', draftId: record.id, taskKey: content.task.taskKey, coder: content.route.coder, route: content.route.reason, plan: content.plan });
      return { ok: true, draftId: record.id, taskKey: content.task.taskKey, coder: content.route.coder, markdown: renderPlan(content) };
    } catch (error) {
      return taskFail(error);
    }
  },
});

interface CoderAgentLike {
  stream: (prompt: string, options: Record<string, unknown>) => Promise<{ fullStream: AsyncIterable<{ type: string; payload?: Record<string, unknown> }>; text: Promise<string> }>;
}

// Runs the routed coder in the developer's workspace (same run, same bridge), relaying each tool
// it uses as a Task step.
async function runCoder(mastra: unknown, coder: CoderId, prompt: string, requestContext: RequestContextLike | undefined, writer: ToolWriterLike | undefined, round: number): Promise<string> {
  const agent = (mastra as { getAgent?: (id: string) => CoderAgentLike } | undefined)?.getAgent?.(`coder-${coder}`);
  if (!agent) throw new Error(`coder ${coder} is not registered`);
  const output = await agent.stream(prompt, { requestContext, maxSteps: 40 });
  for await (const chunk of output.fullStream) {
    if (chunk.type === 'tool-call') {
      const args = (chunk.payload?.args ?? {}) as Record<string, unknown>;
      const detail = String(args.path ?? args.command ?? args.pattern ?? '').slice(0, 200);
      await emit(writer, { kind: 'step', phase: 'coder-tool', round, coder, tool: String(chunk.payload?.toolName ?? ''), detail });
    }
  }
  return (await output.text) || '(the coder gave no summary)';
}

const coderInputSchema = z
  .object({
    mode: z.enum(['execute', 'revise']),
    draftId: z.string().describe('execute: the approved plan draftId. revise: the review draftId from the last execute or revise'),
    approved: z.boolean().optional().describe('execute: must be true; set only after ask_user returned an approval of the plan'),
    feedback: z.string().optional().describe('revise: the developer\'s feedback at Gate 5, verbatim'),
  })
  .strict();

export const delegateToCoderTool = createTool({
  id: 'delegate_to_coder',
  description:
    "Coders + Evaluator. execute: plan draftId + approved -> the routed coder implements the approved plan in the developer's workspace, AURA runs the checks, the Evaluator reviews, up to the configured rounds (returns the review draftId). revise: review draftId + feedback -> another pass with the developer's feedback. Then ask_user for Gate 5 (Approve / Revise / Reject).",
  inputSchema: coderInputSchema,
  outputSchema: taskOutputSchema,
  execute: async (input, context: ToolContext) => {
    try {
      const run = runFrom(context.requestContext);
      if (!run) return taskFail('delegate_to_coder needs an AURA run');
      let planRecord: DraftRecord<TaskPlanDraft> | null;
      let feedback: string | undefined;
      if (input.mode === 'execute') {
        if (input.approved !== true) return taskFail('execute requires approved=true, which is only set after the developer approved the plan via ask_user');
        planRecord = await draftStore.get<TaskPlanDraft>(input.draftId);
        if (!planRecord || planRecord.kind !== 'task-plan') return taskFail(`unknown plan ${input.draftId}`);
        // Gate 4 passed: the conversation's workspace is no longer read-only.
        await draftStore.markFiled(planRecord.id, { ...planRecord.filed, approved: new Date().toISOString() });
      } else {
        if (!input.feedback?.trim()) return taskFail('revise needs the developer\'s feedback');
        const review = await draftStore.get<TaskReviewDraft>(input.draftId);
        if (!review || review.kind !== 'task-review') return taskFail(`unknown review ${input.draftId}`);
        planRecord = await draftStore.get<TaskPlanDraft>(review.content.planDraftId);
        if (!planRecord?.filed.approved) return taskFail('the plan behind this review was never approved');
        feedback = input.feedback.trim();
      }
      const { task, route, plan } = planRecord.content;
      const bridge = bridgeFor(context.requestContext!);
      const checks = (await projectChecks(bridge)) ?? plan.checks;
      const designContext = task.epicKey ? `The Epic's design documents (${task.epicKey}) are available with design_docs.` : '';
      const taskText = task.description ? `Task description:\n${untrusted(`Jira ${task.taskKey}`, task.description)}` : '';
      const maxRounds = settingsFrom(context.requestContext).evaluatorRounds ?? 3;

      await emit(context.writer, { kind: 'coding', taskKey: task.taskKey, coder: route.coder, checks, maxRounds });
      const result = await runCoderLoop(
        { taskKey: task.taskKey, plan: { ...plan, checks }, context: [taskText, designContext].filter(Boolean).join('\n\n'), maxRounds, feedback },
        {
          code: (prompt, round) => runCoder(context.mastra, route.coder, prompt, context.requestContext, context.writer, round),
          checks: () => runChecks(bridge, checks),
          change: () => collectChange(bridge),
          evaluate: (e) => generateObject(context.mastra as MastraLike, 'evaluator', evaluatorPrompt({ taskKey: task.taskKey, ...e }), evaluatorVerdictSchema),
          notes: () => takeNotes(run.runId),
          emit: (event: LoopEvent) => emit(context.writer, { kind: 'step', ...event }),
        },
      );
      const review: TaskReviewDraft = {
        planDraftId: planRecord.id,
        taskKey: task.taskKey,
        coder: route.coder,
        rounds: result.rounds,
        passed: result.passed,
        changedFiles: result.change.files,
        diffStat: result.change.diffStat,
      };
      const record = await draftStore.create({ kind: 'task-review', content: review, threadId: planRecord.threadId, epicKey: task.epicKey, parentId: input.mode === 'revise' ? input.draftId : planRecord.id });
      await emit(context.writer, { kind: 'review', draftId: record.id, taskKey: task.taskKey, coder: route.coder, passed: result.passed, rounds: result.rounds.length, changedFiles: result.change.files, checks: result.rounds.at(-1)?.checks.map((c) => ({ command: c.command, passed: c.passed, exitCode: c.exitCode })) ?? [], verdict: result.rounds.at(-1)?.verdict ?? null });
      return { ok: true, draftId: record.id, taskKey: task.taskKey, coder: route.coder, passed: result.passed, markdown: renderReview(review) };
    } catch (error) {
      return taskFail(error);
    }
  },
});

const reviewInputSchema = z
  .object({
    mode: z.enum(['accept']),
    draftId: z.string().describe('the review draftId the developer approved'),
    approved: z.boolean().optional().describe('must be true; set only after ask_user returned an approval of the review'),
  })
  .strict();

export const delegateToReviewTool = createTool({
  id: 'delegate_to_review',
  description: 'Gate 5. accept: review draftId + approved -> records that the developer accepted the change, comments the Jira Task, and makes it ready for a pull request.',
  inputSchema: reviewInputSchema,
  outputSchema: taskOutputSchema,
  execute: async (input, context: ToolContext) => {
    try {
      if (input.approved !== true) return taskFail('accept requires approved=true, which is only set after the developer approved the review via ask_user');
      const record = await draftStore.get<TaskReviewDraft>(input.draftId);
      if (!record || record.kind !== 'task-review') return taskFail(`unknown review ${input.draftId}`);
      if (!record.filed.accepted) {
        await draftStore.markFiled(record.id, { ...record.filed, accepted: new Date().toISOString() });
        const files = record.content.changedFiles.map((f) => f.path);
        await jira
          .addComment(record.content.taskKey, `The developer accepted AURA's change in VS Code (coder: ${record.content.coder}, ${record.content.rounds.length} round(s), checks ${record.content.passed ? 'green' : 'not all green'}).\n\nFiles: ${files.join(', ') || 'none'}`)
          .catch(() => undefined);
      }
      await emit(context.writer, { kind: 'accepted', draftId: record.id, taskKey: record.content.taskKey });
      return { ok: true, draftId: record.id, taskKey: record.content.taskKey };
    } catch (error) {
      return taskFail(error);
    }
  },
});
