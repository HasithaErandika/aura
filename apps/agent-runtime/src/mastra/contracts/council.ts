import { z } from 'zod';

// Contracts for the Coding Council (workflows/coding-council.ts): the Reviewer's structured
// verdict, which alone decides whether the loop continues, and the per-turn event streamed to
// apps/api as a `data-council-turn` chunk (mirrored into run_steps and forwarded to clients as
// SSE event "council" - packages/aura-client CouncilTurn is the client-side copy).

export const reviewIssueSchema = z.object({
  file: z.string().describe('path relative to the project root, or "(plan)" when reviewing a plan'),
  line: z.number().int().positive().optional(),
  severity: z.enum(['blocker', 'major', 'minor']),
  problem: z.string().min(1),
  fix: z.string().describe('what to change, concretely'),
});
export type ReviewIssue = z.infer<typeof reviewIssueSchema>;

export const reviewVerdictSchema = z.object({
  verdict: z.enum(['APPROVE', 'CHANGES']),
  summary: z.string().describe('one or two sentences'),
  criteria: z
    .array(z.object({ criterion: z.string(), met: z.boolean(), evidence: z.string() }))
    .describe('one entry per acceptance criterion of the Task'),
  issues: z.array(reviewIssueSchema).describe('empty when verdict is APPROVE'),
});
export type ReviewVerdict = z.infer<typeof reviewVerdictSchema>;

export type CouncilRole = 'planner' | 'implementer' | 'reviewer' | 'system';
export type CouncilPhase = 'plan' | 'plan-review' | 'build' | 'checks' | 'review' | 'fix' | 'done';

export interface CouncilTurn {
  draftId: string;
  round: number;
  phase: CouncilPhase;
  role: CouncilRole;
  model?: string;
  status: 'started' | 'done' | 'waiting' | 'error';
  text?: string;
  verdict?: ReviewVerdict['verdict'];
  issues?: ReviewIssue[];
  checks?: { id: string; ok: boolean; output: string }[];
  usage?: { totalTokens: number; budget: number };
}

export interface CouncilResult {
  mode: CouncilMode;
  approved: boolean;
  rounds: number;
  summary: string;
  openIssues: ReviewIssue[];
  totalTokens: number;
  transcriptPath: string | null;
}

// How much of the council runs (docs/plans/aura-code-cli-council.md section 7):
//   - lean: the Implementer plans inline as its first step, then checks -> review -> fix rounds.
//           No separate Planner, so the project is read once instead of twice (~70-80% the cost).
//   - full: Planner -> plan review -> Implementer -> checks -> review -> fix rounds.
// "auto" picks per Task at draft time (chooseCouncilMode), so the human sees and approves it.
export const councilModes = ['lean', 'full'] as const;
export type CouncilMode = (typeof councilModes)[number];
export const councilModeSettings = ['auto', ...councilModes] as const;
export type CouncilModeSetting = (typeof councilModeSettings)[number];

// Areas where a separate, reviewed plan is worth its cost whatever the Task's size.
const RISKY = /\b(auth\w*|login|password|token|secret|credential|permission|payment|billing|migration|encrypt\w*|security|pii|gdpr)\b/i;
const LIST_ITEM = /^\s*(?:[-*]|\d+[.)]|\[[ x]\])\s+\S/gm;

export const LEAN_MAX_ITEMS = 6;
export const LEAN_MAX_CHARS = 2500;

// Deterministic, so the same Task always gets the same mode and the reason can be shown. Pass the
// Task's own summary + description, not the full Gate 5 prompt with its fixed instructions.
export function chooseCouncilMode(setting: CouncilModeSetting, taskText: string): { mode: CouncilMode; reason: string } {
  if (setting !== 'auto') return { mode: setting, reason: `COUNCIL_MODE=${setting}` };
  const risky = RISKY.exec(taskText);
  if (risky) return { mode: 'full', reason: `touches a sensitive area ("${risky[0]}")` };
  const items = taskText.match(LIST_ITEM)?.length ?? 0;
  if (items > LEAN_MAX_ITEMS) return { mode: 'full', reason: `${items} listed requirements` };
  if (taskText.length > LEAN_MAX_CHARS) return { mode: 'full', reason: 'long Task description' };
  return { mode: 'lean', reason: `small Task (${items} listed requirement${items === 1 ? '' : 's'})` };
}

export function councilModeSetting(): CouncilModeSetting {
  const raw = process.env.COUNCIL_MODE?.trim().toLowerCase();
  return (councilModeSettings as readonly string[]).includes(raw ?? '') ? (raw as CouncilModeSetting) : 'auto';
}
