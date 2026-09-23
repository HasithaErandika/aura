import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { QaDraft } from '../contracts/qa-drafts';
import type { CodingTaskDraft } from '../contracts/coding-drafts';
import { draftStore, type DraftRecord } from '../store/draft-store';
import { jira } from '../mcp/jira-client';
import { TESTER_MODEL_ID } from '../agents/registry';
import { generateObject, type MastraLike } from '../lib/generate-object';
import { qaWorkspaceRoot } from '../workspace/qa-workspace';
import { isDockerAvailable, runInContainer } from '../lib/docker-exec';
import { reviseQaScenario } from '../tools/delegate-tools/qa';
import { runCodingFix } from '../tools/delegate-tools/code';
import { provenance } from '../tools/delegate-tools/shared';

const execFileAsync = promisify(execFile);

// Gate 7 as a bounded test -> diagnose -> route -> retest loop (docs/ARCHITECTURE.md section
// 2.4/5.3), replacing the old one-shot delegate_to_test execute. What changed and why:
//
// The old design ran the QA-filed suite once, had a small model summarize the JSON result, and
// stopped - a human had to notice a failure, ask a developer to fix it, then manually re-invoke
// Gate 7 to retest. It also never distinguished "the app is broken" from "the test itself is
// wrong" (QA never saw the real code when writing it - see workspace/read-scaffold-context.ts).
//
// This workflow instead: runs the real suite (unchanged - still Playwright's own JSON output,
// never a model's claim), and on failure collects evidence (the real error, the exact test
// source, the current git commit) and diagnoses each failure through an explicit hierarchy
// before taking any action:
//   infra failure? -> app startup failure? -> test/env problem? -> test implementation
//   problem? -> application defect? -> requirements ambiguity?
// Only two stages map to an automatic action: a test implementation problem routes back to QA
// (revising ONLY that one failing scenario - reviseQaScenario, never the whole plan), and an
// application defect routes to the Coding Agent (runCodingFix, against the same already-
// scaffolded directory, never a fresh scaffold). Every other stage - including "the model isn't
// confident" - routes to a human immediately; the loop never guesses on an unsure diagnosis.
// A fix attempt is retried up to MAX_ITERATIONS times; hitting the cap (or an immediate "route
// to human") halts the loop and the run is flagged HALTED_LOOP_GUARD (previously an unused
// column - see docs/ARCHITECTURE.md section 5.3) for a human to pick up with the full attempt
// history attached, not just the last failure.

export const MAX_ITERATIONS = 3;

interface TestRunEntry {
  image: string;
  port: number;
  startCommand: string;
  description: string;
}

// Fixed per discipline - never chosen by a model. Moved here from delegate-tools/test.ts, which
// now only drafts the plan and defers the real run to this workflow.
export const TEST_COMMANDS: Partial<Record<'Frontend' | 'Backend', TestRunEntry>> = {
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

function buildTestCommand(entry: TestRunEntry): string {
  return [
    'npm install --silent',
    `(${entry.startCommand} > /tmp/app.log 2>&1 &)`,
    `npx --yes wait-on@7 http://localhost:${entry.port} --timeout 30000 || { echo SETUP_FAILED > /workspace/${TEST_SETUP_FAILED_FILE}; cp /tmp/app.log /workspace/app.log 2>/dev/null; exit 0; }`,
    `APP_BASE_URL=http://localhost:${entry.port} npx --yes playwright test /qa-tests --reporter=json > /workspace/${TEST_RESULTS_FILE} 2>/workspace/test-stderr.log`,
    'true',
  ].join('\n');
}

interface RawFailure {
  name: string;
  error: string;
  // The spec file Playwright ran, when the JSON reporter includes it (it does, on the `spec`
  // node) - lets a failure be traced back to the exact QA scenario fileName that produced it,
  // both for feeding its real source into diagnosis and for routing a "bad test" fix at the
  // right file (never a fuzzy title match).
  file: string | null;
}

// Walks Playwright's JSON reporter shape (suites -> specs -> tests -> results), threading the
// nearest `file` field down so each failure carries the spec file it came from.
function extractFailures(raw: unknown): RawFailure[] {
  const failures: RawFailure[] = [];
  function walk(node: unknown, titlePath: string[], file: string | null): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    const nextPath = typeof n.title === 'string' ? [...titlePath, n.title] : titlePath;
    const nextFile = typeof n.file === 'string' ? n.file : file;
    if (Array.isArray(n.suites)) for (const s of n.suites) walk(s, nextPath, nextFile);
    if (Array.isArray(n.specs)) for (const s of n.specs) walk(s, nextPath, nextFile);
    if (Array.isArray(n.tests)) {
      for (const t of n.tests as Record<string, unknown>[]) {
        const results = Array.isArray(t.results) ? (t.results as Record<string, unknown>[]) : [];
        const failedResult = results.find((r) => r.status === 'failed' || r.status === 'timedOut');
        if (failedResult) {
          const error = (failedResult.error as Record<string, unknown> | undefined)?.message;
          failures.push({ name: nextPath.join(' > '), error: typeof error === 'string' ? error : 'no error message captured', file: nextFile });
        }
      }
    }
  }
  walk(raw, [], null);
  return failures;
}

function scenarioFileNameFromSpecFile(specFile: string | null): string | null {
  if (!specFile) return null;
  const base = path.basename(specFile);
  return base.endsWith('.spec.ts') ? base.slice(0, -'.spec.ts'.length) : null;
}

async function currentCommit(targetDir: string): Promise<string | null> {
  try {
    const r = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd: targetDir });
    return r.stdout.trim() || null;
  } catch {
    return null;
  }
}

const diagnosisSchema = z.object({
  name: z.string(),
  stage: z.string().describe('Which hierarchy level this was attributed to, e.g. "5. application defect" - be specific, not just the classification'),
  classification: z.enum(['code_bug', 'bad_test', 'unknown']),
  confidence: z.enum(['low', 'medium', 'high']),
  reasoning: z.string().describe('One or two sentences, grounded only in the evidence given - never assume a cause the evidence does not support'),
});
export type FailureDiagnosis = z.infer<typeof diagnosisSchema>;

const DIAGNOSIS_PROMPT_PREAMBLE = `You are diagnosing why real, automated Playwright tests just failed against a real running application - not guessing from a description. Evidence for each failure is given below: the exact error, the test's own source, the current git commit, and (when available) the application's own console/stdout output during the run.

For EACH failure, work through this hierarchy in order and stop at the first level that the evidence actually supports - never skip ahead on assumption:
1. Infrastructure failure (Docker/container/network problem, unrelated to the app or test)
2. Application startup failure (the app itself never became ready to receive requests)
3. Test/environment problem (wrong base URL, timing/race condition, flaky wait)
4. Test implementation problem (wrong selector, a route/element the app never had, an outdated assumption in the test) -> classification "bad_test"
5. Application defect (driven correctly, the app did the wrong thing or errored) -> classification "code_bug"
6. Requirements ambiguity (the Story/AC do not clearly say what should happen here)

Only levels 4 and 5 map to an automatic fix (bad_test -> a human-reviewed QA revision of that one test; code_bug -> a human-reviewed Dev fix). Levels 1, 2, 3, and 6 must be classification "unknown" - a human decides those, AURA will not guess or modify anything on them.

If you are not genuinely confident, classification must be "unknown" with confidence "low". A wrong guess here means AURA edits the wrong thing (test or code) instead of asking a human - that is worse than asking.`;

async function diagnoseFailures(
  mastra: MastraLike,
  failures: { failure: RawFailure; testSource: string | null; commit: string | null; appOutputTail: string }[],
): Promise<FailureDiagnosis[]> {
  const evidenceBlocks = failures.map(
    ({ failure, testSource, commit, appOutputTail }, i) =>
      `### Failure ${i + 1}: ${failure.name}\n\nError:\n${failure.error}\n\nCommit under test: ${commit ?? 'unknown (no git history yet)'}\n\nTest source (spec file: ${failure.file ?? 'unknown'}):\n${testSource ?? '(could not locate this test\'s source file)'}\n\nApplication output tail during this run:\n${appOutputTail || '(none captured)'}`,
  );
  const prompt = `${DIAGNOSIS_PROMPT_PREAMBLE}\n\n${evidenceBlocks.join('\n\n---\n\n')}\n\nReturn only the JSON the schema describes - one diagnosis per failure, in the same order, using each failure's own "name" verbatim.`;
  const { diagnoses } = await generateObject(mastra, 'tester', prompt, z.object({ diagnoses: z.array(diagnosisSchema).min(1) }));
  return diagnoses;
}

const attemptRecordSchema = z.object({
  attempt: z.number(),
  commit: z.string().nullable(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  diagnoses: z.array(diagnosisSchema),
  route: z.enum(['dev', 'qa', 'human', 'none']),
  action: z.string(),
});
export type AttemptRecord = z.infer<typeof attemptRecordSchema>;

// Both the workflow's own inputSchema and the looped step's input/outputSchema (dountil feeds a
// step's own output back in as its next input, so they must match).
const attemptStateSchema = z.object({
  epicKey: z.string(),
  taskKey: z.string(),
  targetDir: z.string(),
  discipline: z.enum(['Frontend', 'Backend']),
  testRunDraftId: z.string(),
  attempt: z.number(),
  done: z.boolean(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  haltReason: z.enum(['passed', 'cap_reached', 'escalated_unknown']).nullable(),
  bugKey: z.string().nullable(),
  history: z.array(attemptRecordSchema),
});
export type AttemptState = z.infer<typeof attemptStateSchema>;

const attemptStep = createStep({
  id: 'test-diagnose-route',
  inputSchema: attemptStateSchema,
  outputSchema: attemptStateSchema,
  execute: async ({ inputData, mastra, writer }) => {
    const state = inputData;
    const entry = TEST_COMMANDS[state.discipline];
    if (!entry) throw new Error(`No test runner is configured for ${state.discipline}`);
    if (!(await isDockerAvailable())) throw new Error('Docker is not available - install/start Docker to run tests');

    const qaTestsDir = path.resolve(qaWorkspaceRoot, state.epicKey, 'qa', 'tests');
    try {
      await access(qaTestsDir);
    } catch {
      throw new Error(`No Playwright test files found at ${qaTestsDir} - re-run delegate_to_qa's file step for ${state.epicKey}`);
    }

    await runInContainer({
      image: entry.image,
      hostDir: state.targetDir,
      command: buildTestCommand(entry),
      mounts: [{ hostPath: qaTestsDir, containerPath: '/qa-tests', readOnly: true }],
      timeoutMs: 15 * 60_000,
      name: `aura-test-${state.testRunDraftId}-${state.attempt}`,
      labels: { 'aura.epic': state.epicKey, 'aura.task': state.taskKey, 'aura.kind': 'test' },
      onOutput: (chunk) => {
        void writer?.custom({ type: 'data-test-output', data: { chunk, attempt: state.attempt }, transient: true });
      },
    });

    const commit = await currentCommit(state.targetDir);
    const setupFailedPath = path.join(state.targetDir, TEST_SETUP_FAILED_FILE);
    const resultsPath = path.join(state.targetDir, TEST_RESULTS_FILE);

    let appLogTail = '';
    try {
      await access(setupFailedPath);
      appLogTail = (await readFile(path.join(state.targetDir, 'app.log'), 'utf-8').catch(() => '')).slice(-2000);
      // Startup failures are level 2 in the hierarchy - never a code_bug/bad_test guess, and
      // retrying the identical command rarely helps a genuine startup problem, so this halts
      // immediately rather than burning the remaining attempts.
      const record: AttemptRecord = { attempt: state.attempt, commit, passed: 0, failed: 0, skipped: 0, diagnoses: [], route: 'human', action: `The app never started listening on its port within 30s. Last output:\n${appLogTail || '(none captured)'}` };
      await persistAttempt(state, record, 'escalated_unknown');
      await commentAndMaybeTransition(state, [...state.history, record], 'escalated_unknown', commit);
      const startupHalt: AttemptState = { ...state, done: true, haltReason: 'escalated_unknown', history: [...state.history, record] };
      return startupHalt;
    } catch {
      // No setup-failed marker - proceed to read the real result.
    }

    let raw: PlaywrightJsonResultRoot;
    try {
      raw = JSON.parse(await readFile(resultsPath, 'utf-8')) as PlaywrightJsonResultRoot;
    } catch (error) {
      throw new Error(`Neither a result nor a setup-failure marker was found after the run - something unexpected happened. ${error instanceof Error ? error.message : String(error)}`);
    }

    const passed = raw.stats?.expected ?? 0;
    const failed = raw.stats?.unexpected ?? 0;
    const skipped = raw.stats?.skipped ?? 0;
    const failures = extractFailures(raw);

    if (failed === 0) {
      const record: AttemptRecord = { attempt: state.attempt, commit, passed, failed, skipped, diagnoses: [], route: 'none', action: 'All tests passed.' };
      const history = [...state.history, record];
      await persistAttempt(state, record, 'passed');
      await commentAndMaybeTransition(state, history, 'passed', commit);
      const passedState: AttemptState = { ...state, done: true, haltReason: 'passed', passed, failed, skipped, history };
      return passedState;
    }

    // Gather evidence per failure: its real source (via the spec file Playwright reported,
    // matched back to the QA draft's own scenario record) and the app's own output tail.
    const qaRecord = await draftStore.latestByEpic<QaDraft>('qa-plan', state.epicKey);
    const appOutputTail = appLogTail; // empty unless a startup marker was set, which returned above already
    const evidence = failures.map((failure) => {
      const scenarioFileName = scenarioFileNameFromSpecFile(failure.file);
      const scenario = scenarioFileName ? qaRecord?.content.scenarios.find((s) => s.fileName === scenarioFileName) : undefined;
      return { failure, testSource: scenario?.playwrightSource ?? null, commit, appOutputTail };
    });

    const diagnoses = await diagnoseFailures(mastra, evidence);
    const lowConfidence = diagnoses.some((d) => d.confidence === 'low' || d.classification === 'unknown');
    const anyCodeBug = diagnoses.some((d) => d.classification === 'code_bug');
    const allBadTest = diagnoses.length > 0 && diagnoses.every((d) => d.classification === 'bad_test');

    // Never guess on an unsure diagnosis - route the whole attempt to a human immediately,
    // consuming no further iterations, the moment any failure isn't confidently explained.
    if (lowConfidence) {
      const record: AttemptRecord = { attempt: state.attempt, commit, passed, failed, skipped, diagnoses, route: 'human', action: 'At least one failure could not be diagnosed with confidence - escalated rather than guessed.' };
      const history = [...state.history, record];
      await persistAttempt(state, record, 'escalated_unknown');
      await commentAndMaybeTransition(state, history, 'escalated_unknown', commit);
      const lowConfidenceState: AttemptState = { ...state, done: true, haltReason: 'escalated_unknown', passed, failed, skipped, history, bugKey: state.bugKey };
      return lowConfidenceState;
    }

    let bugKey = state.bugKey;
    let action: string;
    let route: AttemptRecord['route'];

    if (anyCodeBug) {
      route = 'dev';
      const codeBugFailures = diagnoses.filter((d) => d.classification === 'code_bug');
      const feedback = codeBugFailures.map((d) => `- ${d.name} (${d.stage}): ${d.reasoning}`).join('\n');
      bugKey = await fileOrUpdateBug(state, bugKey, codeBugFailures, feedback, commit);
      const fix = await runCodingFix(await requireTaskDraft(state.taskKey, state.epicKey, state.targetDir, state.discipline), feedback, writer);
      action = `Routed to Coding Agent (${codeBugFailures.length} failure(s) diagnosed as application defects). Fix attempt exit code ${fix.exitCode}, commit ${fix.commit ?? 'uncommitted'}. Bug: ${bugKey ?? 'not filed'}.`;
    } else if (allBadTest) {
      route = 'qa';
      const fixedFiles: string[] = [];
      const skippedFiles: string[] = [];
      for (const d of diagnoses) {
        const failure = failures.find((f) => f.name === d.name);
        const fileName = scenarioFileNameFromSpecFile(failure?.file ?? null);
        if (!fileName || !qaRecord) {
          skippedFiles.push(d.name);
          continue;
        }
        try {
          await reviseQaScenario(mastra, qaRecord, fileName, `${d.reasoning} (error: ${failure?.error ?? 'n/a'})`);
          fixedFiles.push(fileName);
        } catch {
          skippedFiles.push(d.name);
        }
      }
      action = `Routed to QA (${fixedFiles.length} scenario(s) revised: ${fixedFiles.join(', ') || 'none'}).${skippedFiles.length ? ` Could not map to a scenario file: ${skippedFiles.join(', ')}.` : ''}`;
    } else {
      // Mixed bag that isn't low-confidence but also isn't cleanly all-one-thing - be
      // conservative and escalate rather than partially acting.
      const record: AttemptRecord = { attempt: state.attempt, commit, passed, failed, skipped, diagnoses, route: 'human', action: 'Diagnoses were mixed in a way this loop is not set up to act on automatically.' };
      const history = [...state.history, record];
      await persistAttempt(state, record, 'escalated_unknown');
      await commentAndMaybeTransition(state, history, 'escalated_unknown', commit);
      const mixedState: AttemptState = { ...state, done: true, haltReason: 'escalated_unknown', passed, failed, skipped, history, bugKey };
      return mixedState;
    }

    const record: AttemptRecord = { attempt: state.attempt, commit, passed, failed, skipped, diagnoses, route, action };
    const history = [...state.history, record];
    const nextAttempt = state.attempt + 1;
    const cappedOut = nextAttempt > MAX_ITERATIONS;
    const nextState: AttemptState = { ...state, attempt: nextAttempt, passed, failed, skipped, history, bugKey, done: cappedOut, haltReason: cappedOut ? 'cap_reached' : null };
    await persistAttempt(state, record, cappedOut ? 'cap_reached' : null);
    if (cappedOut) await commentAndMaybeTransition(state, history, 'cap_reached', commit);
    return nextState;
  },
});

// Persists cumulative loop state into the SAME test-run draft across every attempt (not a new
// version per attempt - this is one continuous run's progress, not a distinct new artifact).
async function persistAttempt(state: AttemptState, latest: AttemptRecord, haltReason: AttemptState['haltReason'] | 'cap_reached' | null): Promise<void> {
  await draftStore.markFiled(state.testRunDraftId, {
    status: haltReason ? 'halted' : latest.route === 'none' ? 'done' : 'running',
    attempt: String(latest.attempt),
    passed: String(latest.passed),
    failed: String(latest.failed),
    skipped: String(latest.skipped),
    haltReason: haltReason ?? '',
    bugKey: state.bugKey ?? '',
    summary: latest.action,
    failureNotes: JSON.stringify(latest.diagnoses.map((d) => ({ name: d.name, verdict: d.classification, note: d.reasoning }))),
    history: JSON.stringify([...state.history, latest]),
  });
}

// Fetches (or reconstructs) the coding-task draft runCodingFix needs to know provider/targetDir
// for this Task - reuses the most recent one filed for it, since Gate 5 always creates one.
async function requireTaskDraft(taskKey: string, epicKey: string, targetDir: string, discipline: 'Frontend' | 'Backend'): Promise<DraftRecord<CodingTaskDraft>> {
  const candidates = await draftStore.listByEpic<CodingTaskDraft>('coding-task', epicKey, 50);
  const match = candidates.find((r) => r.content.taskKey === taskKey);
  if (match) return match;
  // No prior coding-task draft found (unusual - Gate 5 should have created one) - build a
  // minimal one so the fix can still run against the existing scaffold.
  return draftStore.create<CodingTaskDraft>({
    kind: 'coding-task',
    content: { epicKey, taskKey, discipline, targetDir, provider: 'mastra', prompt: `Implement Jira Task ${taskKey}.` },
    epicKey,
  });
}

// Creates one Jira Bug the first time a code_bug diagnosis routes to Dev, then only comments on
// it for every later attempt against the same failure - never a new Bug per retry.
async function fileOrUpdateBug(state: AttemptState, existingBugKey: string | null, failures: FailureDiagnosis[], feedback: string, commit: string | null): Promise<string | null> {
  const body = [
    `Attempt ${state.attempt} for Task ${state.taskKey} (Epic ${state.epicKey}), diagnosed as application defect(s) by the Tester Agent loop:`,
    '',
    feedback,
    '',
    `Commit under test: ${commit ?? 'unknown'}`,
    `Detected by: test-run draft ${state.testRunDraftId}, attempt ${state.attempt}`,
  ].join('\n');
  try {
    if (existingBugKey) {
      await jira.addComment(existingBugKey, body);
      return existingBugKey;
    }
    const created = await jira.createIssue({
      summary: `Test failure: ${state.taskKey} - diagnosed as an application defect by the Tester Agent`,
      issueType: 'Bug',
      description: [`Linked: Story/Task ${state.taskKey}, Epic ${state.epicKey}.`, '', body].join('\n'),
      parentKey: state.epicKey,
    });
    await jira.addComment(state.taskKey, `AURA Tester Agent diagnosed a real failure as an application defect and filed ${created.key}${created.url ? ` (${created.url})` : ''}. Routing to the Coding Agent automatically; this Bug will be updated (not duplicated) on further attempts.`);
    return created.key;
  } catch {
    return existingBugKey;
  }
}

async function commentAndMaybeTransition(state: AttemptState, history: AttemptRecord[], haltReason: NonNullable<AttemptState['haltReason']>, commit: string | null): Promise<void> {
  const stamp = provenance('tester-agent', TESTER_MODEL_ID, await draftStore.get(state.testRunDraftId) ?? { id: state.testRunDraftId, kind: 'test-run', version: 1, parentId: null, threadId: null, epicKey: state.epicKey, content: {}, filed: {}, createdAt: new Date().toISOString() }, `${state.taskKey} (Task)`);
  const attemptLines = history.map(
    (r) => `- Attempt ${r.attempt}: ${r.passed} passed, ${r.failed} failed, ${r.skipped} skipped, commit ${r.commit ?? 'n/a'} - ${r.action}`,
  );
  const headline =
    haltReason === 'passed'
      ? `AURA Tester Agent: all tests passed after ${history.length} attempt(s).`
      : haltReason === 'cap_reached'
        ? `AURA Tester Agent: HALTED_LOOP_GUARD - still failing after ${MAX_ITERATIONS} attempts. A human needs to look at this.`
        : `AURA Tester Agent: escalated to a human - a failure could not be diagnosed confidently, or the app itself never started.`;
  const body = [headline, '', '**Attempt history:**', ...attemptLines, '', '----', stamp].join('\n');
  try {
    await jira.addComment(state.taskKey, body);
    if (haltReason === 'passed') {
      const transitions = await jira.getTransitions(state.taskKey);
      const ready = transitions.find((t) => t.name.toLowerCase() === 'ready for release');
      if (ready) await jira.transitionIssue(state.taskKey, ready.id);
    }
  } catch {
    // Best-effort; the attempt history is already durable in the draft record either way.
  }
}

export const testerWorkflow = createWorkflow({
  id: 'tester-workflow',
  inputSchema: attemptStateSchema,
  outputSchema: attemptStateSchema,
})
  .dountil(attemptStep, async ({ inputData, iterationCount }) => {
    if (iterationCount > MAX_ITERATIONS + 1) return true; // hard backstop even if state bookkeeping above ever disagrees
    return inputData.done;
  })
  .commit();
