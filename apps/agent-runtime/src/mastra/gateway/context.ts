// What apps/api tells the runtime about the turn, as requestContext (the runtime only trusts it
// because only the API can call it - server/runtime-auth.ts). Never taken from the model.

interface RequestContextLike {
  get: (key: string) => unknown;
}

// Every turn: the AURA run (apps/api workflow_runs.id) this turn belongs to, so every tool call,
// span and metric can be tied back to the run, its approvals and its audit rows.
export const RUN_CONTEXT_KEY = 'auraRun';

export interface RunContext {
  runId: string;
  requestId: string | null;
  userId: string;
  role: string;
}

// Resumed turns only: the human decision that resumed this run (apps/api approvals.service.ts).
export const DECISION_CONTEXT_KEY = 'auraDecision';

export type HumanDecision = 'approve' | 'revise' | 'reject' | 'answer';

export interface DecisionContext {
  approvalId: string;
  decision: HumanDecision;
  userId: string;
  role: string;
  decidedAt: string;
}

const DECISIONS: readonly HumanDecision[] = ['approve', 'revise', 'reject', 'answer'];

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function runFrom(requestContext: RequestContextLike | undefined): RunContext | null {
  const v = requestContext?.get(RUN_CONTEXT_KEY) as Record<string, unknown> | undefined;
  const runId = text(v?.runId);
  const userId = text(v?.userId);
  if (!runId || !userId) return null;
  return { runId, requestId: text(v?.requestId), userId, role: text(v?.role) ?? 'unknown' };
}

export function decisionFrom(requestContext: RequestContextLike | undefined): DecisionContext | null {
  const v = requestContext?.get(DECISION_CONTEXT_KEY) as Record<string, unknown> | undefined;
  const approvalId = text(v?.approvalId);
  const userId = text(v?.userId);
  const decision = text(v?.decision) as HumanDecision | null;
  if (!approvalId || !userId || !decision || !DECISIONS.includes(decision)) return null;
  return { approvalId, decision, userId, role: text(v?.role) ?? 'unknown', decidedAt: text(v?.decidedAt) ?? new Date().toISOString() };
}

// A decision that lets a gated step go ahead. "answer" counts: it's a human picking one of the
// gate's own options whose label the clients couldn't classify (apps/web GateCard.tsx), e.g.
// "Start the test loop". revise and reject never do.
export function authorizesGatedStep(decision: DecisionContext | null): boolean {
  return decision?.decision === 'approve' || decision?.decision === 'answer';
}
