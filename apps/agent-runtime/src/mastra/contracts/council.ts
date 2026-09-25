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
  approved: boolean;
  rounds: number;
  summary: string;
  openIssues: ReviewIssue[];
  totalTokens: number;
  transcriptPath: string | null;
}
