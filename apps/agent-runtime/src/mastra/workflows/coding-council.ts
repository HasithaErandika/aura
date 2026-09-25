import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Agent } from '@mastra/core/agent';
import { createImplementer, createPlanner, createReviewer } from '../agents/council-agents';
import { reviewVerdictSchema, type CouncilPhase, type CouncilResult, type CouncilRole, type CouncilTurn, type ReviewIssue, type ReviewVerdict } from '../contracts/council';
import { generateObjectWith, type AgentLike } from '../lib/generate-object';
import { runAllChecks, type CheckResult } from '../lib/sandbox';
import { takeCouncilNotes } from '../store/council-notes';
import { recordModelUsage } from '../store/usage-store';
import { AURA_GIT_IDENTITY, type ToolWriterLike } from '../tools/delegate-tools/shared';

const execFileAsync = promisify(execFile);

// The Coding Council - provider "council" of delegate_to_code (Gate 5), docs/plans/
// aura-code-cli-council.md section 4.4. Three agents discuss the work instead of one agent
// writing code in a single shot:
//
//   1. PLAN     Planner writes a plan; Reviewer critiques it (<= planRounds); Planner revises.
//   2. BUILD    Implementer implements the agreed plan; the project's own checks run.
//   3. REVIEW   Reviewer reviews the real diff + real check output -> APPROVE | CHANGES.
//               CHANGES -> Implementer fixes only the listed issues -> checks -> REVIEW again
//               (<= maxRounds).
//   4. DONE     approved, rounds exhausted, or token budget exhausted.
//
// All of it runs inside ONE human-approved Gate 5 execute, the same trust boundary the Tester
// loop and the Architect workflow already use. The human stays last: Gate 5's approval starts
// this, and the result is reviewed before anyone commits it (`aura commit`).
//
// Built for free-tier models: turns are strictly sequential; a rate-limited call waits (up to
// MAX_WAIT_MS) and retries after the model chain's own fallbacks are exhausted; the Reviewer sees
// the diff, never the whole repo; earlier rounds reach later turns only as a compact summary; and
// a token budget stops the run cleanly rather than failing mid-edit. A failing check forces
// CHANGES no matter what the Reviewer says - real output always outranks a model's opinion.
//
// Every round ends in a checkpoint commit ("council: round N", authored by AURA) on the Task's
// branch, so any round can be inspected or rolled back; `aura commit` later folds them into one
// commit authored by the developer.

export interface CouncilSettings {
  planRounds: number;
  maxRounds: number;
  implementerSteps: number;
  fixSteps: number;
  tokenBudget: number;
}

function intFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  return Number.isInteger(raw) && raw >= min && raw <= max ? raw : fallback;
}

export function councilSettings(): CouncilSettings {
  return {
    planRounds: intFromEnv('COUNCIL_PLAN_ROUNDS', 1, 0, 3),
    maxRounds: intFromEnv('COUNCIL_MAX_ROUNDS', 2, 1, 5),
    implementerSteps: intFromEnv('COUNCIL_IMPLEMENTER_STEPS', 15, 3, 40),
    fixSteps: intFromEnv('COUNCIL_FIX_STEPS', 8, 2, 30),
    tokenBudget: intFromEnv('COUNCIL_TOKEN_BUDGET', 150_000, 10_000, 5_000_000),
  };
}

const MAX_DIFF_CHARS = 60_000;
const MAX_WAIT_MS = 30_000;
const MAX_PROVIDER_RETRIES = 2;
const PROVIDER_ERROR_WAIT_MS = 20_000;
const AURA_LOCAL_FILES = ['.aura/', '.aura-task-prompt.txt'];

class BudgetExhausted extends Error {
  constructor() {
    super('token budget reached');
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

// Keeps AURA's own working files (the prompt file, council transcripts) out of every commit.
async function ensureExcluded(cwd: string): Promise<void> {
  const commonDir = path.resolve(cwd, (await git(cwd, ['rev-parse', '--git-common-dir'])).trim());
  const excludeFile = path.join(commonDir, 'info', 'exclude');
  const current = await readFile(excludeFile, 'utf8').catch(() => '');
  const missing = AURA_LOCAL_FILES.filter((p) => !current.split('\n').includes(p));
  if (missing.length === 0) return;
  await mkdir(path.dirname(excludeFile), { recursive: true });
  await appendFile(excludeFile, `${current && !current.endsWith('\n') ? '\n' : ''}# AURA working files\n${missing.join('\n')}\n`);
}

async function checkpoint(cwd: string, round: number): Promise<string | null> {
  await git(cwd, ['add', '-A']);
  const staged = (await git(cwd, ['diff', '--cached', '--name-only'])).trim();
  if (!staged) return null;
  await git(cwd, [...AURA_GIT_IDENTITY, 'commit', '-q', '-m', `council: round ${round}`]);
  return (await git(cwd, ['rev-parse', '--short', 'HEAD'])).trim();
}

async function diffSince(cwd: string, base: string): Promise<string> {
  const text = await git(cwd, ['diff', base, 'HEAD']);
  return text.length > MAX_DIFF_CHARS ? `${text.slice(0, MAX_DIFF_CHARS)}\n…(diff truncated at ${MAX_DIFF_CHARS} characters)` : text;
}

interface GenerateResultLike {
  text?: string;
  totalUsage?: { totalTokens?: number };
  response?: { modelId?: string; modelMetadata?: { modelProvider?: string; modelId?: string } };
}

// The model that actually answered (after any fallback), as the provider reported it.
function answeringModel(result: GenerateResultLike): string {
  const meta = result.response?.modelMetadata;
  if (meta?.modelProvider && meta.modelId) return `${meta.modelProvider.split('.')[0]}/${meta.modelId}`;
  return result.response?.modelId ?? 'unknown model';
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 120);
}

// An error from a model provider's API (HTTP status attached by the AI SDK), as opposed to a bug
// or a schema-validation failure, which retrying would not fix.
function isProviderError(error: unknown): boolean {
  const e = error as { statusCode?: number; name?: string } | undefined;
  return typeof e?.statusCode === 'number' || e?.name === 'AI_APICallError' || isRateLimit(error);
}

function isRateLimit(error: unknown): boolean {
  const e = error as { statusCode?: number; status?: number; message?: string } | undefined;
  return e?.statusCode === 429 || e?.status === 429 || /rate.?limit|too many requests|quota|429/i.test(e?.message ?? '');
}

// Groq: "Please try again in 7.66s"; OpenAI-style: "retry after 12 seconds"; else a header.
function retryAfterMs(error: unknown): number {
  const e = error as { message?: string; responseHeaders?: Record<string, string> } | undefined;
  const header = Number(e?.responseHeaders?.['retry-after']);
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const match = /(?:try again|retry) (?:in|after) ([\d.]+)\s*(ms|s|seconds?)?/i.exec(e?.message ?? '');
  if (match) return Number(match[1]) * (match[2] === 'ms' ? 1 : 1000);
  return 15_000;
}

function checksText(checks: CheckResult[]): string {
  if (checks.length === 0) return '(this project defines no typecheck/build/test/lint steps)';
  return checks.map((c) => `### ${c.id}: ${c.ok ? 'PASSED' : 'FAILED'}\n${c.ok ? '' : c.output.slice(-4000)}`).join('\n\n');
}

function issuesText(issues: ReviewIssue[]): string {
  return issues.map((i, n) => `${n + 1}. [${i.severity}] ${i.file}${i.line ? `:${i.line}` : ''} - ${i.problem}\n   Fix: ${i.fix}`).join('\n');
}

function notesText(notes: string[]): string {
  return notes.length ? `\n\nThe human developer added these notes - they take priority:\n${notes.map((n) => `- ${n}`).join('\n')}` : '';
}

// Council runs in progress, for the Runners view (server/runners-routes.ts). Observational only.
export interface ActiveCouncil {
  draftId: string;
  taskKey: string;
  dir: string;
  round: number;
  phase: CouncilPhase;
  role: CouncilRole;
  status: CouncilTurn['status'];
  totalTokens: number;
  budget: number;
  startedAt: string;
}
const activeCouncils = new Map<string, ActiveCouncil>();

export function listActiveCouncils(): ActiveCouncil[] {
  return [...activeCouncils.values()];
}

export interface CouncilInput {
  draftId: string;
  taskKey: string;
  targetDir: string;
  // The deterministic Gate 5 prompt built from the Jira Task (delegate-tools/code.ts).
  taskPrompt: string;
  writer?: ToolWriterLike;
}

export async function runCodingCouncil(input: CouncilInput): Promise<CouncilResult> {
  try {
    return await runCouncil(input);
  } finally {
    activeCouncils.delete(input.draftId);
  }
}

async function runCouncil(input: CouncilInput): Promise<CouncilResult> {
  const settings = councilSettings();
  const { draftId, targetDir: cwd } = input;
  const transcript: string[] = [`# Coding Council - ${input.taskKey} (${draftId})`, '', `Started ${new Date().toISOString()}`, ''];
  let totalTokens = 0;
  const live: ActiveCouncil = { draftId, taskKey: input.taskKey, dir: cwd, round: 0, phase: 'plan', role: 'planner', status: 'started', totalTokens: 0, budget: settings.tokenBudget, startedAt: new Date().toISOString() };
  activeCouncils.set(draftId, live);

  const emit = (turn: Omit<CouncilTurn, 'draftId'>) => {
    Object.assign(live, { round: turn.round, phase: turn.phase, role: turn.role, status: turn.status, totalTokens });
    const full: CouncilTurn = { draftId, ...turn, ...(turn.status === 'done' ? { usage: { totalTokens, budget: settings.tokenBudget } } : {}) };
    void input.writer?.custom({ type: 'data-council-turn', data: full, transient: true });
    if (turn.status === 'done' || turn.status === 'error') {
      transcript.push(`## Round ${turn.round} · ${turn.phase} · ${turn.role}${turn.model ? ` (${turn.model})` : ''}`, '');
      if (turn.text) transcript.push(turn.text.trim(), '');
      if (turn.verdict) transcript.push(`**Verdict: ${turn.verdict}**`, '');
      if (turn.issues?.length) transcript.push(issuesText(turn.issues), '');
      if (turn.checks?.length) transcript.push(turn.checks.map((c) => `- ${c.ok ? '✓' : '✗'} ${c.id}`).join('\n'), '');
    }
  };

  const track = (model: string, tokens: number) => {
    totalTokens += tokens;
    void recordModelUsage(model, tokens).catch(() => undefined);
  };

  // One agent turn with budget accounting and rate-limit waits. The agent's own model chain
  // already fails over between providers; this only waits when every model in it is limited.
  //
  // The error that reaches here is the LAST model's in the chain, which hides why the earlier
  // ones failed - e.g. Gemini's per-minute limit pushed a call onto a Groq model with a bad key.
  // So any provider API error (not just a 429) earns a wait-and-retry of the whole chain, by
  // which time a per-minute limit on an earlier model has usually reset.
  async function turn<T>(round: number, phase: CouncilPhase, role: CouncilRole, call: () => Promise<T>): Promise<T> {
    if (totalTokens >= settings.tokenBudget) throw new BudgetExhausted();
    emit({ round, phase, role, status: 'started' });
    for (let attempt = 0; ; attempt++) {
      try {
        return await call();
      } catch (error) {
        if (!isProviderError(error) || attempt >= MAX_PROVIDER_RETRIES) throw error;
        const wait = Math.min(isRateLimit(error) ? retryAfterMs(error) : PROVIDER_ERROR_WAIT_MS, MAX_WAIT_MS);
        const reason = isRateLimit(error) ? 'rate limited' : `model error (${errorText(error)})`;
        emit({ round, phase, role, status: 'waiting', text: `${reason} - retrying in ${Math.ceil(wait / 1000)}s` });
        await new Promise((resolve) => setTimeout(resolve, wait + 250));
      }
    }
  }

  // Runs a tool-using agent to completion and records which model actually answered.
  async function runAgent(agent: Agent, prompt: string, maxSteps: number): Promise<{ text: string; model: string }> {
    const result = (await agent.generate(prompt, { maxSteps })) as unknown as GenerateResultLike;
    const model = answeringModel(result);
    track(model, result.totalUsage?.totalTokens ?? 0);
    return { text: result.text?.trim() || '(no summary returned)', model };
  }

  // The Reviewer answers with structured JSON only; usage is captured through a thin wrapper.
  const reviewer = createReviewer();
  let reviewerModel = 'reviewer';
  const trackedReviewer: AgentLike = {
    generate: async (prompt, options) => {
      const result = (await reviewer.generate(prompt, options as never)) as unknown as GenerateResultLike & { object?: unknown };
      reviewerModel = answeringModel(result);
      track(reviewerModel, result.totalUsage?.totalTokens ?? 0);
      return result;
    },
  };
  const review = (prompt: string) => generateObjectWith<ReviewVerdict>(trackedReviewer, 'Council Reviewer', prompt, reviewVerdictSchema);

  const planner = createPlanner(cwd);
  const implementer = createImplementer(cwd);

  await ensureExcluded(cwd);
  const startSha = (await git(cwd, ['rev-parse', 'HEAD'])).trim();

  let approved = false;
  let rounds = 0;
  let openIssues: ReviewIssue[] = [];
  let summary = '';
  let stoppedEarly: string | null = null;

  try {
    // 1. PLAN
    let plan = await turn(0, 'plan', 'planner', () =>
      runAgent(planner, `${input.taskPrompt}${notesText(takeCouncilNotes(draftId))}\n\nExplore the project, then write the implementation plan.`, 8),
    );
    emit({ round: 0, phase: 'plan', role: 'planner', model: plan.model, status: 'done', text: plan.text });

    for (let r = 1; r <= settings.planRounds; r++) {
      const verdict = await turn(0, 'plan-review', 'reviewer', () =>
        review(`Review this implementation PLAN (no code exists yet) against the Task.\n\n# Task\n${input.taskPrompt}\n\n# Plan\n${plan.text}\n\nUse file "(plan)" for issues about the plan as a whole.`),
      );
      emit({ round: 0, phase: 'plan-review', role: 'reviewer', model: reviewerModel, status: 'done', text: verdict.summary, verdict: verdict.verdict, issues: verdict.issues });
      if (verdict.verdict === 'APPROVE') break;
      plan = await turn(0, 'plan', 'planner', () =>
        runAgent(planner, `${input.taskPrompt}\n\n# Your current plan\n${plan.text}\n\n# Reviewer issues\n${issuesText(verdict.issues)}${notesText(takeCouncilNotes(draftId))}\n\nRevise the plan to address every issue.`, 6),
      );
      emit({ round: 0, phase: 'plan', role: 'planner', model: plan.model, status: 'done', text: plan.text });
    }

    // 2. BUILD
    rounds = 1;
    const build = await turn(1, 'build', 'implementer', () =>
      runAgent(implementer, `${input.taskPrompt}\n\n# Agreed plan\n${plan.text}${notesText(takeCouncilNotes(draftId))}\n\nImplement the plan now.`, settings.implementerSteps),
    );
    emit({ round: 1, phase: 'build', role: 'implementer', model: build.model, status: 'done', text: build.text });
    let lastSummary = build.text;

    // 3. REVIEW (+ FIX) rounds
    for (let round = 1; ; round++) {
      rounds = round;
      emit({ round, phase: 'checks', role: 'system', status: 'started' });
      const checks = await runAllChecks(cwd);
      emit({ round, phase: 'checks', role: 'system', status: 'done', checks, text: checks.length ? undefined : 'No checks defined in this project.' });
      const sha = await checkpoint(cwd, round);
      if (sha) emit({ round, phase: 'checks', role: 'system', status: 'done', text: `checkpoint commit ${sha} (council: round ${round})` });

      const diff = await diffSince(cwd, startSha);
      if (!diff.trim()) {
        stoppedEarly = 'The Implementer made no changes to the code.';
        break;
      }

      let verdict = await turn(round, 'review', 'reviewer', () =>
        review(`Review this CODE CHANGE against the Task.\n\n# Task\n${input.taskPrompt}\n\n# Agreed plan\n${plan.text}\n\n# Implementer's summary\n${lastSummary}\n\n# Check results\n${checksText(checks)}\n\n# Diff (unified, since the council started)\n${diff}`),
      );
      const failed = checks.filter((c) => !c.ok);
      if (failed.length > 0 && verdict.verdict === 'APPROVE') {
        // Real check output outranks the model: a failing check is never approved.
        verdict = {
          ...verdict,
          verdict: 'CHANGES',
          issues: [...verdict.issues, ...failed.map((c): ReviewIssue => ({ file: '(checks)', severity: 'blocker', problem: `${c.id} fails`, fix: `Make ${c.id} pass:\n${c.output.slice(-1500)}` }))],
        };
      }
      emit({ round, phase: 'review', role: 'reviewer', model: reviewerModel, status: 'done', text: verdict.summary, verdict: verdict.verdict, issues: verdict.issues });
      openIssues = verdict.issues;
      summary = verdict.summary;

      if (verdict.verdict === 'APPROVE') {
        approved = true;
        openIssues = [];
        break;
      }
      if (round >= settings.maxRounds) {
        stoppedEarly = `Reached the round limit (${settings.maxRounds}) without the Reviewer approving.`;
        break;
      }

      const fix = await turn(round + 1, 'fix', 'implementer', () =>
        runAgent(implementer, `${input.taskPrompt}\n\n# Reviewer issues to fix (fix ONLY these)\n${issuesText(verdict.issues)}${notesText(takeCouncilNotes(draftId))}\n\nFix the issues, re-run the relevant checks, then summarise what you changed.`, settings.fixSteps),
      );
      emit({ round: round + 1, phase: 'fix', role: 'implementer', model: fix.model, status: 'done', text: fix.text });
      lastSummary = fix.text;
    }
  } catch (error) {
    if (error instanceof BudgetExhausted) {
      stoppedEarly = `Token budget reached (${totalTokens.toLocaleString()} / ${settings.tokenBudget.toLocaleString()}). Stopped cleanly; the work so far is committed as checkpoints.`;
      await checkpoint(cwd, rounds + 1).catch(() => null);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      emit({ round: rounds, phase: 'done', role: 'system', status: 'error', text: message });
      await checkpoint(cwd, rounds + 1).catch(() => null);
      await writeTranscript(cwd, draftId, transcript).catch(() => null);
      throw error;
    }
  }

  const finalText = approved
    ? `Reviewer approved after ${rounds} round${rounds === 1 ? '' : 's'}. ${summary}`
    : `Not approved by the Reviewer. ${stoppedEarly ?? ''} ${openIssues.length ? `${openIssues.length} open issue(s) - review before committing.` : ''}`.trim();
  emit({ round: rounds, phase: 'done', role: 'system', status: 'done', text: finalText, issues: openIssues.length ? openIssues : undefined });
  const transcriptPath = await writeTranscript(cwd, draftId, transcript).catch(() => null);

  return { approved, rounds, summary: finalText, openIssues, totalTokens, transcriptPath };
}

async function writeTranscript(cwd: string, draftId: string, lines: string[]): Promise<string> {
  const dir = path.join(cwd, '.aura', 'council');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${draftId}.md`);
  await writeFile(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}
