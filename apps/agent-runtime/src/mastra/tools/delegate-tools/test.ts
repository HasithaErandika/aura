import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { QaDraft } from '../../contracts/qa-drafts';
import { draftStore } from '../../store/draft-store';
import { jira } from '../../mcp/jira-client';
import { TESTER_MODEL_ID } from '../../agents/registry';
import { generateObject, type MastraLike } from '../../lib/generate-object';
import { devWorkspaceDir } from '../../workspace/dev-workspace';
import { qaWorkspaceRoot } from '../../workspace/qa-workspace';
import { isDockerAvailable, runInContainer } from '../../lib/docker-exec';
import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { provenance, disciplineFromTask } from './shared';

interface TestRunEntry {
  image: string;
  port: number;
  startCommand: string;
  description: string;
}

// Fixed per discipline, like SCAFFOLD_COMMANDS (dev.ts) - never chosen by a model. Only the two
// disciplines Gate 4 actually scaffolds reliably (docs/adr/0001-dev-agent-scaffold-and-template-
// strategy.md) are supported; anything else fails clearly rather than guessing how to start an
// app it was never taught to run.
const TEST_COMMANDS: Partial<Record<'Frontend' | 'Backend', TestRunEntry>> = {
  Frontend: {
    image: 'mcr.microsoft.com/playwright:v1.48.0-jammy',
    port: 4173,
    startCommand: 'npm run dev -- --port 4173 --strictPort',
    description: 'npm install, start the Vite dev server on port 4173, wait for it to respond, then run the QA-filed Playwright suite against it.',
  },
  Backend: {
    image: 'mcr.microsoft.com/playwright:v1.48.0-jammy',
    port: 4000,
    startCommand: 'PORT=4000 npm run start',
    description: 'npm install, start the NestJS app on port 4000, wait for it to respond, then run the QA-filed Playwright suite against it.',
  },
};

const TEST_RESULTS_FILE = 'test-results.json';
const TEST_SETUP_FAILED_FILE = 'test-setup-failed.txt';

interface PlaywrightJsonResultRoot {
  stats?: { expected?: number; unexpected?: number; skipped?: number; duration?: number };
  suites?: unknown[];
}

// Builds the fixed shell script run inside the container. Setup (install + start + wait for the
// port) is separated from the test run itself with its own `|| { ...; exit 0 }` branch, so a
// real test failure (Playwright's own non-zero exit) is never confused with the app failing to
// start - only the latter writes TEST_SETUP_FAILED_FILE. The whole script always exits 0; the
// real result lives in TEST_RESULTS_FILE, read back by delegate-tools.ts after the container
// exits, never in this exit code (principle 5 - a red suite must never look like an infra crash).
function buildTestCommand(entry: TestRunEntry): string {
  return [
    'npm install --silent',
    `(${entry.startCommand} > /tmp/app.log 2>&1 &)`,
    `npx --yes wait-on@7 http://localhost:${entry.port} --timeout 30000 || { echo SETUP_FAILED > /workspace/${TEST_SETUP_FAILED_FILE}; cp /tmp/app.log /workspace/app.log 2>/dev/null; exit 0; }`,
    `APP_BASE_URL=http://localhost:${entry.port} npx --yes playwright test /qa-tests --reporter=json > /workspace/${TEST_RESULTS_FILE} 2>/workspace/test-stderr.log`,
    'true',
  ].join('\n');
}

// Walks Playwright's JSON reporter shape (suites -> specs -> tests -> results) to pull out each
// failing test's title path and error message. Best-effort: an unrecognized future shape
// degrades to an empty list, never a crash - the raw file is still attached to the Jira comment.
function extractFailures(raw: unknown): { name: string; error: string }[] {
  const failures: { name: string; error: string }[] = [];
  function walk(node: unknown, titlePath: string[]): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    const nextPath = typeof n.title === 'string' ? [...titlePath, n.title] : titlePath;
    if (Array.isArray(n.suites)) for (const s of n.suites) walk(s, nextPath);
    if (Array.isArray(n.specs)) for (const s of n.specs) walk(s, nextPath);
    if (Array.isArray(n.tests)) {
      for (const t of n.tests as Record<string, unknown>[]) {
        const results = Array.isArray(t.results) ? (t.results as Record<string, unknown>[]) : [];
        const failedResult = results.find((r) => r.status === 'failed' || r.status === 'timedOut');
        if (failedResult) {
          const error = (failedResult.error as Record<string, unknown> | undefined)?.message;
          failures.push({ name: nextPath.join(' > '), error: typeof error === 'string' ? error : 'no error message captured' });
        }
      }
    }
  }
  walk(raw, []);
  return failures;
}

interface TestRunDraft {
  epicKey: string;
  taskKey: string;
  targetDir: string;
  discipline: 'Frontend' | 'Backend';
}

const testInputSchema = z
  .object({
    mode: z.enum(['draft', 'execute']),
    epicKey: z.string().optional().describe('draft: the Epic this Task belongs to (must have a filed QA plan)'),
    taskKey: z.string().optional().describe('draft: the Jira Task key to test (must already be scaffolded via delegate_to_dev)'),
    draftId: z.string().optional().describe('execute: the draftId returned by draft'),
    approved: z.boolean().optional().describe('execute: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const testOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable plan, or the interpreted real result after execute. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  taskKey: z.string().optional(),
  passed: z.number().optional(),
  failed: z.number().optional(),
  error: z.string().optional(),
});

function testFail(error: unknown): z.infer<typeof testOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

const testerInterpretationSchema = z.object({
  summary: z.string().min(10),
  failureNotes: z.array(z.object({ name: z.string(), verdict: z.enum(['likely-real', 'likely-flaky', 'unsure']), note: z.string() })),
});

export const delegateToTestTool = createTool({
  id: 'delegate_to_test',
  description:
    "Tester Agent (Gate 7). draft: epicKey + taskKey -> confirms the Task is scaffolded and its Epic has a filed QA plan, returns the fixed test-run plan (returns draftId + markdown). execute: draftId + approved -> actually starts the scaffolded app and runs the QA Agent's real Playwright suite against it inside a sandboxed Docker container, reads back the real JSON result, and has the Tester Agent interpret it - never fakes, assumes, or rounds a result. Comments the Task with the real pass/fail numbers plus the interpretation, kept visibly separate. Only Frontend and Backend/NestJS are supported (the disciplines Gate 4 actually scaffolds reliably) - fails clearly for anything else. Never execute without an explicit human approval.",
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

          const targetDir = await devWorkspaceDir(epicKey, discipline);
          let scaffolded = false;
          try {
            scaffolded = (await readdir(targetDir)).length > 0;
          } catch {
            scaffolded = false;
          }
          if (!scaffolded) return testFail(`${taskKey} has not been scaffolded yet - run delegate_to_dev for it first (Gate 4)`);

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

          if (record.filed.status === 'done') {
            return {
              ok: true,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              passed: Number(record.filed.passed ?? '0'),
              failed: Number(record.filed.failed ?? '0'),
              markdown: 'Already ran. Nothing was run twice.',
            };
          }

          const entry = TEST_COMMANDS[record.content.discipline];
          if (!entry) return testFail(`No test runner is configured for ${record.content.discipline}`);
          if (!(await isDockerAvailable())) return testFail('Docker is not available - install/start Docker to run tests');

          const qaTestsDir = path.resolve(qaWorkspaceRoot, record.content.epicKey, 'qa', 'tests');
          try {
            await access(qaTestsDir);
          } catch {
            return testFail(`No Playwright test files found at ${qaTestsDir} - re-run delegate_to_qa's file step for ${record.content.epicKey}`);
          }

          try {
            await runInContainer({
              image: entry.image,
              hostDir: record.content.targetDir,
              command: buildTestCommand(entry),
              mounts: [{ hostPath: qaTestsDir, containerPath: '/qa-tests', readOnly: true }],
              timeoutMs: 15 * 60_000,
              name: `aura-test-${record.id}`,
              labels: { 'aura.epic': record.content.epicKey, 'aura.task': record.content.taskKey, 'aura.kind': 'test' },
              onOutput: (chunk) => {
                void writer?.custom({ type: 'data-test-output', data: { chunk }, transient: true });
              },
            });
          } catch (error) {
            return testFail(error);
          }

          const setupFailedPath = path.join(record.content.targetDir, TEST_SETUP_FAILED_FILE);
          const resultsPath = path.join(record.content.targetDir, TEST_RESULTS_FILE);
          try {
            await access(setupFailedPath);
            const appLog = await readFile(path.join(record.content.targetDir, 'app.log'), 'utf-8').catch(() => '(no app log captured)');
            return testFail(`The app never started listening on its port within 30s, so no tests ran. Last app output:\n${appLog.slice(-2000)}`);
          } catch {
            // No setup-failed marker - proceed to read the real result.
          }

          let raw: PlaywrightJsonResultRoot;
          try {
            raw = JSON.parse(await readFile(resultsPath, 'utf-8')) as PlaywrightJsonResultRoot;
          } catch (error) {
            return testFail(`Neither a result nor a setup-failure marker was found after the run - something unexpected happened. ${error instanceof Error ? error.message : String(error)}`);
          }

          const passed = raw.stats?.expected ?? 0;
          const failed = raw.stats?.unexpected ?? 0;
          const skipped = raw.stats?.skipped ?? 0;
          const failures = extractFailures(raw);

          let interpretation = { summary: `${passed} passed, ${failed} failed, ${skipped} skipped. No failures to interpret.`, failureNotes: [] as z.infer<typeof testerInterpretationSchema>['failureNotes'] };
          if (failures.length) {
            const prompt = `Interpret this real Playwright result for Task ${record.content.taskKey} - ${passed} passed, ${failed} failed, ${skipped} skipped.\n\nFailures:\n${failures.map((f) => `- ${f.name}: ${f.error}`).join('\n')}\n\nReturn only the JSON the schema describes.`;
            interpretation = await generateObject(mastra as MastraLike, 'tester', prompt, testerInterpretationSchema);
          }

          const markdown = [
            `# Test result for ${record.content.taskKey} (${record.content.epicKey})`,
            '',
            `**Real result:** ${passed} passed, ${failed} failed, ${skipped} skipped.`,
            '',
            '## AI interpretation',
            interpretation.summary,
            ...(interpretation.failureNotes.length ? ['', ...interpretation.failureNotes.map((f) => `- **${f.name}** (${f.verdict}): ${f.note}`)] : []),
          ].join('\n');

          await draftStore.markFiled(record.id, {
            status: 'done',
            passed: String(passed),
            failed: String(failed),
            skipped: String(skipped),
            summary: interpretation.summary,
            failureNotes: JSON.stringify(interpretation.failureNotes),
          });
          const stamp = provenance('Tester Agent', TESTER_MODEL_ID, record, `${record.content.taskKey} (Task)`);
          try {
            await jira.addComment(
              record.content.taskKey,
              [
                `AURA Tester Agent ran the Gate 6 Playwright suite: ${passed} passed, ${failed} failed, ${skipped} skipped (machine result).`,
                '',
                '**AI interpretation:**',
                interpretation.summary,
                ...(interpretation.failureNotes.length ? ['', ...interpretation.failureNotes.map((f) => `- **${f.name}** (${f.verdict}): ${f.note}`)] : []),
                '',
                '----',
                stamp,
              ].join('\n'),
            );
            if (failed === 0) {
              const transitions = await jira.getTransitions(record.content.taskKey);
              const ready = transitions.find((t) => t.name.toLowerCase() === 'ready for release');
              if (ready) await jira.transitionIssue(record.content.taskKey, ready.id);
            }
          } catch {
            // Best-effort; the real result and interpretation are already returned to the human.
          }

          return { ok: true, draftId: record.id, epicKey: record.content.epicKey, taskKey: record.content.taskKey, passed, failed, markdown };
        }
      }
    } catch (error) {
      return testFail(error);
    }
  },
});
