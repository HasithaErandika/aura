import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AgentId } from '../agents/registry';

// Eval scoring and the promotion gate (docs/ARCHITECTURE.md §5 "Eval harness per agent version").
// Each case is a real prompt run against the agent's real model; its output is scored by
// deterministic checks (no model grading another model). A suite's score is the mean case score.
//
// Promotion: a new agent or prompt version may replace the baseline only if it scores at least
// MIN_SCORE and no more than TOLERANCE below the previous baseline. The baseline is a committed
// file, so a human signs off on the promotion in review; baselines.test.ts fails CI when the
// registry's version and the baseline's version disagree.

export const MIN_SCORE = 0.8;
export const TOLERANCE = 0.1;
// A new version may use at most this much more (input + output) tokens per case than the
// baseline: quality can't be bought with a silently doubled bill.
export const TOKEN_GROWTH_LIMIT = 1.25;
export const BASELINE_DIR = path.resolve(import.meta.dirname, '../../../evals/baselines');

export interface Check<T> {
  name: string;
  weight?: number;
  test: (output: T) => boolean;
}

export interface EvalCase<T> {
  id: string;
  prompt: () => string;
  checks: Check<T>[];
}

export interface CaseTokens {
  input: number;
  output: number;
  calls: number; // more than 1 when invalid JSON forced a retry
}

export interface CaseResult {
  score: number;
  failed: string[];
  error?: string;
  tokens?: CaseTokens;
}

export interface Baseline {
  agentId: AgentId;
  agentVersion: string;
  promptVersion: string;
  modelId: string;
  score: number;
  // Mean input + output tokens per case; absent in baselines recorded before token tracking.
  avgTokensPerCase?: number;
  cases: Record<string, CaseResult>;
  ranAt: string;
}

export function scoreCase<T>(checks: Check<T>[], output: T): CaseResult {
  let total = 0;
  let passed = 0;
  const failed: string[] = [];
  for (const check of checks) {
    const weight = check.weight ?? 1;
    total += weight;
    let ok = false;
    try {
      ok = check.test(output);
    } catch {
      ok = false;
    }
    if (ok) passed += weight;
    else failed.push(check.name);
  }
  return { score: total ? passed / total : 0, failed };
}

export function suiteScore(cases: Record<string, CaseResult>): number {
  const scores = Object.values(cases).map((c) => c.score);
  return scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 1000) / 1000 : 0;
}

export function avgTokens(cases: Record<string, CaseResult>): number | undefined {
  const withTokens = Object.values(cases).filter((c) => c.tokens);
  if (!withTokens.length) return undefined;
  return Math.round(withTokens.reduce((sum, c) => sum + c.tokens!.input + c.tokens!.output, 0) / withTokens.length);
}

export type GateResult = { pass: true } | { pass: false; reason: string };

type GateInput = Pick<Baseline, 'score' | 'avgTokensPerCase'>;

export function promotionGate(current: GateInput, previous: (GateInput & Pick<Baseline, 'promptVersion' | 'agentVersion'>) | null): GateResult {
  if (current.score < MIN_SCORE) return { pass: false, reason: `score ${current.score} is below the minimum ${MIN_SCORE}` };
  if (previous && current.score < previous.score - TOLERANCE) {
    return { pass: false, reason: `score ${current.score} regressed more than ${TOLERANCE} from the baseline ${previous.score} (agent ${previous.agentVersion}, prompt ${previous.promptVersion})` };
  }
  if (previous?.avgTokensPerCase && current.avgTokensPerCase && current.avgTokensPerCase > previous.avgTokensPerCase * TOKEN_GROWTH_LIMIT) {
    return { pass: false, reason: `${current.avgTokensPerCase} tokens per case is more than ${TOKEN_GROWTH_LIMIT}x the baseline's ${previous.avgTokensPerCase}` };
  }
  return { pass: true };
}

export function baselinePath(agentId: AgentId): string {
  return path.join(BASELINE_DIR, `${agentId}.json`);
}

export async function readBaseline(agentId: AgentId): Promise<Baseline | null> {
  try {
    return JSON.parse(await readFile(baselinePath(agentId), 'utf8')) as Baseline;
  } catch {
    return null;
  }
}

export async function writeBaseline(baseline: Baseline): Promise<void> {
  await mkdir(BASELINE_DIR, { recursive: true });
  await writeFile(baselinePath(baseline.agentId), `${JSON.stringify(baseline, null, 2)}\n`);
}

// Check helpers. `text` is the whole output as lower-case JSON, for "mentions" checks.
export const text = (output: unknown) => JSON.stringify(output).toLowerCase();
export const mentions = (...terms: string[]) => (output: unknown) => terms.every((t) => text(output).includes(t.toLowerCase()));
export const mentionsNone = (...terms: string[]) => (output: unknown) => terms.every((t) => !text(output).includes(t.toLowerCase()));
export const hasDigit = (items: string[]) => items.some((i) => /\d/.test(i));
