import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { QaDraft } from '../../contracts/qa-drafts';
import { draftStore } from '../../store/draft-store';
import { jira } from '../../mcp/jira-client';
import { TESTER_MODEL_ID } from '../../agents/registry';
import type { MastraLike } from '../../lib/generate-object';
import { devWorkspaceDir, taskWorktreeDir } from '../../workspace/dev-workspace';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { provenance, buildProvenance, disciplineFromTask, type ProvenanceStamp, type ToolWriterLike } from './shared';
import { MAX_ITERATIONS, TEST_COMMANDS, type AttemptState } from '../../workflows/tester-workflow';

interface TestRunDraft {
  epicKey: string;
  taskKey: string;
  targetDir: string;
  discipline: 'Frontend' | 'Backend';
}

const testInputSchema = z
  .object({
    mode: z.enum(['draft', 'execute', 'file-defect']),
    epicKey: z.string().optional().describe('draft: the Epic this Task belongs to (must have a filed QA plan)'),
    taskKey: z.string().optional().describe('draft: the Jira Task key to test (must already be scaffolded via delegate_to_dev)'),
    draftId: z.string().optional().describe('execute and file-defect: the draftId returned by draft'),
    approved: z.boolean().optional().describe('execute and file-defect: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const testOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable plan, final loop summary after execute, or defect confirmation after file-defect. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  taskKey: z.string().optional(),
  passed: z.number().optional(),
  failed: z.number().optional(),
  attempts: z.number().optional().describe('execute: how many test/diagnose/route attempts the loop actually ran'),
  haltedLoopGuard: z.boolean().optional().describe('execute: true when the loop stopped without passing - hit the attempt cap, or escalated an unclear diagnosis - and now needs a human. The Orchestrator MUST call ask_user with the markdown summary when this is true, before doing anything else.'),
  defectKey: z.string().optional().describe('file-defect: the Jira Bug key created for the developer to pick up.'),
  error: z.string().optional(),
  provenance: z.custom<ProvenanceStamp>().optional(),
});

function testFail(error: unknown): z.infer<typeof testOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

// Runs the Tester workflow (workflows/tester-workflow.ts) to completion, relaying its live
// container output into this tool's own stream, the same pattern runQaWorkflow (qa.ts) and
// runArchitectWorkflow (architect.ts) already use for their own workflows.
async function runTesterWorkflow(mastra: MastraLike, initial: AttemptState, writer: ToolWriterLike | undefined): Promise<AttemptState> {
  const workflow = (mastra as { getWorkflow?: (id: string) => { createRun: () => Promise<{ stream: (args: { inputData: AttemptState }) => { fullStream: AsyncIterable<{ type: string; payload?: { chunk?: string; attempt?: number } }>; result: Promise<{ status: string; result?: unknown; error?: { message?: string } }> } }> } } | undefined)?.getWorkflow?.('tester-workflow');
  if (!workflow) throw new Error('tester-workflow is not registered');
  const run = await workflow.createRun();
  const streamOutput = run.stream({ inputData: initial });
  for await (const chunk of streamOutput.fullStream) {
    if (chunk.type === 'data-test-output' && chunk.payload?.chunk) {
      await writer?.custom({ type: 'data-test-output', data: { chunk: chunk.payload.chunk, attempt: chunk.payload.attempt }, transient: true });
    }
  }
  const result = await streamOutput.result;
  if (result.status !== 'success') throw new Error(`test loop failed (${result.status})${result.error?.message ? `: ${result.error.message}` : ''}`);
  return result.result as AttemptState;
}

export const delegateToTestTool = createTool({
  id: 'delegate_to_test',
  description:
    "Tester Agent (Gate 7) - a bounded test -> diagnose -> route -> retest loop, not a single pass. draft: epicKey + taskKey -> confirms the Task is scaffolded and its Epic has a filed QA plan, returns the fixed test-run plan (returns draftId + markdown). execute: draftId + approved -> runs the QA Agent's real Playwright suite in a sandboxed Docker container; on failure it diagnoses each failure from real evidence and routes automatically to the Coding Agent (an application defect) or back to QA (a bad test, revising only that one scenario) and retests - up to 3 attempts total. Comments the Task after every attempt. If it still hasn't passed after 3 attempts, or a failure can't be diagnosed with confidence, it stops and returns haltedLoopGuard=true - you MUST then call ask_user with the returned markdown so a human can decide; never re-run execute again on your own to try to force it past this. Only Frontend and Backend/NestJS are supported. Never execute without an explicit human approval to START the loop - the loop's own internal retries do not ask for further approval, by design. file-defect: draftId + approved, manual escalation only - creates/points at a Jira Bug for the current state (the loop already auto-files one when it diagnoses a code defect itself; use this mainly after a haltedLoopGuard escalation).",
  inputSchema: testInputSchema,
  outputSchema: testOutputSchema,
  execute: async (input, { mastra, agent, writer }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const taskKey = input.taskKey?.trim().toUpperCase();
          if (!epicKey || !taskKey) return testFail('draft needs epicKey and taskKey');
          const task = await jira.getIssue(taskKey);
          if (task.issueType && task.issueType.toLowerCase() !== 'task') return testFail(`${taskKey} is a ${task.issueType}, not a Task`);
          const discipline = disciplineFromTask(task.description || '');
          if (!discipline) return testFail(`Could not read a discipline off ${taskKey} - it should carry "**Discipline:** <name>"`);
          if (discipline !== 'Frontend' && discipline !== 'Backend') return testFail(`Gate 7 only supports Frontend and Backend Tasks (Gate 4's only reliable scaffolds) - ${taskKey} is ${discipline}`);
          const entry = TEST_COMMANDS[discipline];
          if (!entry) return testFail(`No test runner is configured for ${discipline} yet`);

          // This Task's own isolated worktree - the loop tests exactly this Task's code, never
          // another Task's changes sharing the same discipline ("Concurrent Task Execution").
          const baseDir = await devWorkspaceDir(epicKey, discipline);
          const targetDir = taskWorktreeDir(baseDir, taskKey);
          let hasWorktree = false;
          try {
            await access(path.join(targetDir, '.git'));
            hasWorktree = true;
          } catch {
            hasWorktree = false;
          }
          if (!hasWorktree) return testFail(`${taskKey} has no isolated worktree yet - run delegate_to_dev for it first (Gate 4)`);

          const qaRecord = await draftStore.latestByEpic<QaDraft>('qa-plan', epicKey);
          if (!qaRecord || !qaRecord.filed.workspaceWritten) return testFail(`${epicKey} has no filed QA plan yet - run delegate_to_qa (Gate 6) and file it before testing`);

          const content: TestRunDraft = { epicKey, taskKey, targetDir, discipline };
          const record = await draftStore.create({ kind: 'test-run', content, threadId, epicKey });
          const markdown = [
            `# Test run plan for ${taskKey} (${epicKey})`,
            '',
            '*Deterministic - the run command is fixed by AURA, not chosen by a model. Pass/fail comes from the real Playwright result, read back after the container exits.*',
            '',
            `**Discipline:** ${discipline}`,
            `**Target directory:** ${targetDir}`,
            '',
            '## What will run',
            entry.description,
          ].join('\n');
          return { ok: true, draftId: record.id, epicKey, taskKey, markdown };
        }
        case 'execute': {
          if (!input.draftId) return testFail('execute needs draftId');
          if (input.approved !== true) return testFail('execute requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<TestRunDraft>(input.draftId);
          if (!record || record.kind !== 'test-run') return testFail(`unknown test draft ${input.draftId}`);

          if (record.filed.status === 'done' || record.filed.status === 'halted') {
            const attempts = Number(record.filed.attempt ?? '1');
            return {
              ok: record.filed.status === 'done',
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              passed: Number(record.filed.passed ?? '0'),
              failed: Number(record.filed.failed ?? '0'),
              attempts,
              haltedLoopGuard: record.filed.status === 'halted',
              markdown: `Already ${record.filed.status === 'halted' ? `halted after ${attempts} attempt(s): ${record.filed.summary ?? ''}` : 'ran'}. Nothing was run twice.`,
            };
          }

          if (!TEST_COMMANDS[record.content.discipline]) return testFail(`No test runner is configured for ${record.content.discipline}`);

          let finalState: AttemptState;
          try {
            finalState = await runTesterWorkflow(
              mastra as MastraLike,
              {
                epicKey: record.content.epicKey,
                taskKey: record.content.taskKey,
                targetDir: record.content.targetDir,
                discipline: record.content.discipline,
                testRunDraftId: record.id,
                attempt: 1,
                done: false,
                passed: 0,
                failed: 0,
                skipped: 0,
                haltReason: null,
                bugKey: null,
                history: [],
              },
              writer,
            );
          } catch (error) {
            return testFail(error);
          }

          const lastAttempt = finalState.history[finalState.history.length - 1];
          const attemptLines = finalState.history.map((r) => `- Attempt ${r.attempt}: ${r.passed} passed, ${r.failed} failed, ${r.skipped} skipped - ${r.action}`);
          const markdown = [
            `# Test result for ${record.content.taskKey} (${record.content.epicKey})`,
            '',
            finalState.haltReason === 'passed'
              ? `**Passed** after ${finalState.history.length} attempt(s).`
              : `**Still failing** after ${finalState.history.length} attempt(s) - ${finalState.haltReason === 'cap_reached' ? `hit the ${MAX_ITERATIONS}-attempt cap` : 'a failure could not be diagnosed with confidence, or the app never started'}. A human needs to decide next.`,
            '',
            '## Attempt history',
            ...attemptLines,
            ...(lastAttempt?.diagnoses.length ? ['', '## Latest diagnosis', ...lastAttempt.diagnoses.map((d) => `- **${d.name}** — ${d.classification} (${d.confidence} confidence, ${d.stage}): ${d.reasoning}`)] : []),
          ].join('\n');

          return {
            ok: finalState.haltReason === 'passed',
            draftId: record.id,
            epicKey: record.content.epicKey,
            taskKey: record.content.taskKey,
            passed: finalState.passed,
            failed: finalState.failed,
            attempts: finalState.history.length,
            haltedLoopGuard: finalState.haltReason !== 'passed',
            markdown,
            provenance: buildProvenance('tester-agent', TESTER_MODEL_ID, record, `${record.content.taskKey} (Task)`),
          };
        }
        case 'file-defect': {
          if (!input.draftId) return testFail('file-defect needs draftId');
          if (input.approved !== true) return testFail('file-defect requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<TestRunDraft>(input.draftId);
          if (!record || record.kind !== 'test-run') return testFail(`unknown test draft ${input.draftId}`);
          if (record.filed.status !== 'done' && record.filed.status !== 'halted') return testFail('execute has not produced a real result for this draft yet - run execute before filing a defect');
          const failed = Number(record.filed.failed ?? '0');
          if (failed === 0) return testFail('The real result had 0 failures - there is nothing to file a defect for');
          if (record.filed.defectFiled === 'done') {
            return { ok: true, draftId: record.id, epicKey: record.content.epicKey, taskKey: record.content.taskKey, defectKey: record.filed.defectKey, markdown: `Already filed as ${record.filed.defectKey}. Nothing was filed twice.` };
          }
          if (record.filed.bugKey) {
            // The loop itself already auto-filed a Bug when it diagnosed a code defect - point at
            // that one instead of creating a second Bug for the same failure.
            await draftStore.markFiled(record.id, { ...record.filed, defectFiled: 'done', defectKey: record.filed.bugKey });
            return {
              ok: true,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              defectKey: record.filed.bugKey,
              markdown: `The Tester Agent loop already filed ${record.filed.bugKey} for this while it was running. Nothing new was created.`,
            };
          }

          const failureNotes = JSON.parse(record.filed.failureNotes || '[]') as { name: string; verdict: string; note: string }[];
          const stamp = provenance('tester-agent', TESTER_MODEL_ID, record, `${record.content.taskKey} (Task)`);
          const description = [
            `Real Playwright failure(s) found testing ${record.content.taskKey} (${record.content.epicKey}), Gate 7.`,
            '',
            `**Machine result:** ${record.filed.passed} passed, ${record.filed.failed} failed, ${record.filed.skipped} skipped.`,
            '',
            '**AI interpretation:**',
            record.filed.summary || '(no summary captured)',
            ...(failureNotes.length ? ['', ...failureNotes.map((f) => `- **${f.name}** (${f.verdict}): ${f.note}`)] : []),
            '',
            `Fix, then ask AURA to re-run the test suite for ${record.content.taskKey} to retest.`,
            '',
            '----',
            stamp,
          ].join('\n');

          let created: { key: string; url: string | null };
          try {
            created = await jira.createIssue({
              summary: `Test failure: ${record.content.taskKey} - ${failed} Playwright test(s) failing`,
              issueType: 'Bug',
              description,
              parentKey: record.content.epicKey,
            });
          } catch (error) {
            return testFail(error);
          }

          try {
            await jira.addComment(
              record.content.taskKey,
              `AURA Tester Agent filed a defect for the ${failed} failing Playwright test(s): ${created.key}${created.url ? ` (${created.url})` : ''}. Fix the failure(s) described there, then ask to re-run Gate 7 to retest.`,
            );
            const transitions = await jira.getTransitions(record.content.taskKey);
            const back = transitions.find((t) => /in progress|to do|reopen/i.test(t.name));
            if (back) await jira.transitionIssue(record.content.taskKey, back.id);
          } catch {
            // Best-effort, same as execute's own Jira comment/transition - the defect itself is
            // already created and returned to the human regardless of whether this follow-up lands.
          }

          await draftStore.markFiled(record.id, { ...record.filed, defectFiled: 'done', defectKey: created.key });
          return {
            ok: true,
            draftId: record.id,
            epicKey: record.content.epicKey,
            taskKey: record.content.taskKey,
            defectKey: created.key,
            markdown: `Filed defect ${created.key}${created.url ? ` (${created.url})` : ''} for the ${failed} failing test(s), and commented on ${record.content.taskKey} linking to it. Once fixed, ask to re-run Gate 7 to retest.`,
            provenance: buildProvenance('tester-agent', TESTER_MODEL_ID, record, `${record.content.taskKey} (Task)`),
          };
        }
      }
    } catch (error) {
      return testFail(error);
    }
  },
});
