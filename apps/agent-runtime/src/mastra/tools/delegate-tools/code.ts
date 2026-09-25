import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { codingFiledComment, codingProviderLabel, codingProviders, renderCodingPlan, type CodingTaskDraft } from '../../contracts/coding-drafts';
import { draftStore, type DraftRecord } from '../../store/draft-store';
import { jira } from '../../mcp/jira-client';
import { createCodingAgent } from '../../agents/mastra-coding-agent';
import { runCodingCouncil } from '../../workflows/coding-council';
import { devWorkspaceDir, taskWorktreeDir } from '../../workspace/dev-workspace';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { provenance, buildProvenance, disciplineFromTask, type ProvenanceStamp, type ToolWriterLike } from './shared';

const codingInputSchema = z
  .object({
    mode: z.enum(['draft', 'execute']),
    epicKey: z.string().optional().describe('draft: the Epic this Task belongs to'),
    taskKey: z.string().optional().describe('draft: the Jira Task key to implement (must already be scaffolded via delegate_to_dev)'),
    provider: z.enum(codingProviders).optional().describe('draft: which coding agent to use - "council" (AURA Coding Council: Planner, Implementer and Reviewer agents that discuss the work; the default) or "mastra" (AURA\'s single built-in agent, faster, no review). Ask the human, never assume - unless the request already names one.'),
    draftId: z.string().optional().describe('execute: the draftId returned by draft'),
    approved: z.boolean().optional().describe('execute: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const codingOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable draft. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  taskKey: z.string().optional(),
  targetDir: z.string().optional(),
  exitCode: z.number().optional(),
  error: z.string().optional(),
  provenance: z.custom<ProvenanceStamp>().optional(),
});

function codeFail(error: unknown): z.infer<typeof codingOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

// Runs one prompt against an already-scaffolded targetDir with the drafted provider - the
// provider-dispatch logic shared by delegate_to_code's own `execute` case and runCodingFix below
// (the Tester Agent loop's automatic retry, tools/tester-workflow.ts), so there is exactly one
// place that knows how to actually invoke a provider against a directory. Coding runs only
// through AURA's own agents on AURA-governed models (ADR-3 D6) - the Claude Code / Codex CLI
// providers, which ran on developers' personal logins, were removed.
// `approved` is only set by the council: false means it finished without its Reviewer approving,
// so the Task is not moved to In Review.
async function runCodingProviderPrompt(content: CodingTaskDraft, prompt: string, draftId: string, writer: ToolWriterLike | undefined): Promise<{ exitCode: number; output: string; approved?: boolean }> {
  if (content.provider === 'council') {
    try {
      const result = await runCodingCouncil({ draftId, taskKey: content.taskKey, targetDir: content.targetDir, taskPrompt: prompt, writer });
      const lines = [result.summary, `Rounds: ${result.rounds} · tokens: ${result.totalTokens.toLocaleString()}`];
      if (result.transcriptPath) lines.push(`Transcript: ${result.transcriptPath}`);
      return { exitCode: 0, output: lines.join('\n'), approved: result.approved };
    } catch (error) {
      return { exitCode: 1, output: error instanceof Error ? error.message : String(error) };
    }
  }

  if (content.provider === 'mastra') {
    try {
      const codingAgent = createCodingAgent(content.targetDir);
      const response = await codingAgent.generate(prompt, { maxSteps: 20 });
      const summary = response.text?.trim() || '(the agent made changes but returned no summary text)';
      void writer?.custom({ type: 'data-code-output', data: { chunk: summary }, transient: true });
      return { exitCode: 0, output: summary };
    } catch (error) {
      return { exitCode: 1, output: error instanceof Error ? error.message : String(error) };
    }
  }

  // A draft filed before the external CLI providers were removed.
  throw new Error(`Coding provider "${String(content.provider)}" is no longer supported - draft this Task again with provider "council" (or "mastra").`);
}

export interface CodingFixResult {
  record: DraftRecord<CodingTaskDraft>;
  exitCode: number;
  output: string;
  commit: string | null;
}

// Runs an automatic fix attempt against an already-implemented Task, from real test-failure
// evidence - the Tester Agent loop's Dev-routing step (workflows/tester-workflow.ts), not a
// tool the Orchestrator/a human calls directly. This deliberately bypasses delegate_to_code's
// own draft/approve/execute contract: the loop's bounded retries run inside a single already
// human-approved Gate 7 (the "Option A" decision - one approval starts the loop, not one per
// attempt), the same trust boundary the Architect workflow's many internal model calls already
// rely on for Gate 3. It never re-scaffolds; it edits the same targetDir Gate 4/5 already own.
export async function runCodingFix(original: DraftRecord<CodingTaskDraft>, feedback: string, writer?: ToolWriterLike): Promise<CodingFixResult> {
  const prompt = [
    `A real test failure was found against the code you (or a previous attempt) wrote for Task ${original.content.taskKey}: ${original.content.prompt.split('\n')[0]}`,
    '',
    'Failure evidence:',
    feedback,
    '',
    'Fix ONLY what is needed to make this pass. Do not remove or weaken other passing behaviour. Work only within this directory. If a unit/integration test runner is already set up here, update or add a test that covers this fix; do not remove existing tests.',
  ].join('\n');

  const record = await draftStore.create({ kind: 'coding-task', content: { ...original.content, prompt }, threadId: original.threadId, epicKey: original.epicKey, parentId: original.id });
  const result = await runCodingProviderPrompt(record.content, prompt, record.id, writer);
  await draftStore.markFiled(record.id, { status: 'done', exitCode: String(result.exitCode) });

  let commit: string | null = null;
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const r = await promisify(execFile)('git', ['rev-parse', '--short', 'HEAD'], { cwd: record.content.targetDir });
    commit = r.stdout.trim() || null;
  } catch {
    // No git repo, or nothing committed yet - fine, the caller just won't have a commit sha.
  }

  return { record, exitCode: result.exitCode, output: result.output, commit };
}

export const delegateToCodeTool = createTool({
  id: 'delegate_to_code',
  description:
    "Coding Agent. Two built-in providers: 'council' (AURA Coding Council - a Planner, an Implementer and a Reviewer agent plan, implement, run the project's own checks and review each other's work over a few rounds, streaming their discussion live - the default) and 'mastra' (a single built-in agent, faster, no review). draft: epicKey + taskKey + provider -> a deterministic plan built from the Task's own content, no model call (returns draftId + markdown with the exact prompt). execute: draftId + approved -> runs the provider against the Task's own worktree (council can take many minutes; its result says whether the Reviewer approved), then comments the Task and moves it toward In Review. Never execute without an explicit human approval. Fails clearly if the Task has no worktree yet (run delegate_to_dev first).",
  inputSchema: codingInputSchema,
  outputSchema: codingOutputSchema,
  execute: async (input, { agent, writer }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        // Builds the plan deterministically from the Task itself - discipline routes to the
        // same directory the Dev agent scaffolded (delegate_to_dev must have run first).
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const taskKey = input.taskKey?.trim().toUpperCase();
          if (!epicKey || !taskKey) return codeFail('draft needs epicKey, taskKey, and provider');
          if (!input.provider) return codeFail('draft needs a provider - "council" (default) or "mastra"');
          const task = await jira.getIssue(taskKey);
          if (task.issueType && task.issueType.toLowerCase() !== 'task') return codeFail(`${taskKey} is a ${task.issueType}, not a Task`);
          const discipline = disciplineFromTask(task.description || '');
          if (!discipline) return codeFail(`Could not read a discipline off ${taskKey} - it should carry "**Discipline:** <name>"`);

          // This Task's own isolated worktree, created by delegate_to_dev (Gate 4) -  never the
          // shared base repo directly, so two Tasks of the same discipline can never race or
          // overwrite each other's changes ("Concurrent Task Execution" milestone).
          const baseDir = await devWorkspaceDir(epicKey, discipline);
          const targetDir = taskWorktreeDir(baseDir, taskKey);
          let hasWorktree = false;
          try {
            await access(path.join(targetDir, '.git'));
            hasWorktree = true;
          } catch {
            hasWorktree = false;
          }
          if (!hasWorktree) return codeFail(`${taskKey} has no isolated worktree yet - run delegate_to_dev for it first (Gate 4), then come back here`);

          const prompt = [
            `Implement Jira Task ${taskKey}: ${task.summary}`,
            '',
            task.description || '(no description)',
            '',
            'Work only within this directory. Make the acceptance criteria above pass. Do not touch files outside it, and do not run destructive commands.',
            '',
            'Also write or update unit/integration tests for the code you write, using whatever test runner this scaffold already includes (e.g. NestJS ships with Jest; a plain Vite React scaffold has none set up by default - add one only if the acceptance criteria clearly call for it, otherwise focus on the implementation). End-to-end/UI tests are QA\'s responsibility (Gate 6), not yours - stay at the unit/integration level.',
          ].join('\n');

          const content: CodingTaskDraft = { epicKey, taskKey, discipline, targetDir, provider: input.provider, prompt };
          const record = await draftStore.create({ kind: 'coding-task', content, threadId, epicKey });
          return { ok: true, draftId: record.id, markdown: renderCodingPlan(content), epicKey, taskKey };
        }
        // Fetches the human's own connected key just-in-time (never persisted here), writes
        // the prompt to a file, and runs the fixed CLI invocation for the drafted provider.
        // Idempotent: a draft already executed just reports its prior result.
        case 'execute': {
          if (!input.draftId) return codeFail('execute needs draftId');
          if (input.approved !== true) return codeFail('execute requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<CodingTaskDraft>(input.draftId);
          if (!record || record.kind !== 'coding-task') return codeFail(`unknown coding draft ${input.draftId}`);

          if (record.filed.status === 'done') {
            return {
              ok: true,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              targetDir: record.content.targetDir,
              exitCode: Number(record.filed.exitCode ?? '0'),
              markdown: `Already ran (exit code ${record.filed.exitCode ?? '0'}). Nothing was run twice.`,
            };
          }

          let result: { exitCode: number; output: string; approved?: boolean };
          try {
            result = await runCodingProviderPrompt(record.content, record.content.prompt, record.id, writer);
          } catch (error) {
            return codeFail(error);
          }

          await draftStore.markFiled(record.id, { status: 'done', exitCode: String(result.exitCode) });
          // A council run is stamped as its own registry entry (its own versions and models),
          // every other provider as the Coding Agent.
          const stampAgent = record.content.provider === 'council' ? 'coding-council' : 'coding-agent';
          const stamp = provenance(stampAgent, codingProviderLabel[record.content.provider], record, `${record.content.taskKey} (Task)`);
          try {
            await jira.addComment(record.content.taskKey, codingFiledComment(record.content, result.exitCode, result.output, stamp));
          } catch {
            // The comment is informational; the code on disk is what matters.
          }
          if (result.exitCode === 0 && result.approved !== false) {
            try {
              const transitions = await jira.getTransitions(record.content.taskKey);
              const inReview = transitions.find((t) => t.name.toLowerCase() === 'in review');
              if (inReview) await jira.transitionIssue(record.content.taskKey, inReview.id);
            } catch {
              // Best-effort; proceed regardless.
            }
          }

          if (result.exitCode !== 0) {
            return {
              ok: false,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              exitCode: result.exitCode,
              error: `Coding agent failed (exit code ${result.exitCode}). Last output:\n${result.output.slice(-2000)}`,
            };
          }
          return {
            ok: true,
            draftId: record.id,
            epicKey: record.content.epicKey,
            taskKey: record.content.taskKey,
            targetDir: record.content.targetDir,
            exitCode: result.exitCode,
            markdown:
              result.approved === false
                ? `Coding Council finished at ${record.content.targetDir} WITHOUT its Reviewer approving - the Task stays where it is. ${result.output}`
                : `Coding agent finished at ${record.content.targetDir}. Review the changes before merging.${record.content.provider === 'council' ? `\n\n${result.output}` : ''}`,
            provenance: buildProvenance(stampAgent, codingProviderLabel[record.content.provider], record, `${record.content.taskKey} (Task)`),
          };
        }
      }
    } catch (error) {
      return codeFail(error);
    }
  },
});
