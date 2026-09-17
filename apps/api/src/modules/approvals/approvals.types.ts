import type { Role } from "../identity/roles.js";
import type { AskUserOption } from "../runtime/runtime.types.js";

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "REVISION_REQUESTED", "ANSWERED", "EXPIRED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const DECISIONS = ["approve", "reject", "revise", "answer"] as const;
export type Decision = (typeof DECISIONS)[number];

export interface ApprovalRow {
  id: string;
  run_id: string;
  thread_id: string;
  agent_id: string;
  runtime_run_id: string;
  tool_call_id: string;
  producing_agent: string | null;
  required_role: Role | null;
  requested_by: string;
  question: string;
  options: AskUserOption[] | null;
  selection_mode: string | null;
  snapshot: string | null;
  snapshot_hash: string;
  status: ApprovalStatus;
  requested_at: string;
  expires_at: string;
  decided_at: string | null;
}

export interface DecisionRow {
  id: string;
  approval_id: string;
  decided_by: string;
  decided_by_role: Role;
  decision: Decision;
  answer: string | null;
  reason: string | null;
  snapshot_hash: string;
  created_at: string;
}

export interface ApprovalView {
  id: string;
  runId: string;
  threadId: string;
  agentId: string;
  producingAgent: string | null;
  gate: { number: number; name: string; outcome: string } | null;
  requiredRole: Role | null;
  requestedBy: string;
  requester?: { fullName: string | null; email: string } | null;
  question: string;
  options: AskUserOption[];
  selectionMode: "single_select" | "multi_select" | null;
  snapshot: string | null;
  snapshotHash: string;
  status: ApprovalStatus;
  requestedAt: string;
  expiresAt: string;
  decidedAt: string | null;
  decision?: DecisionView | null;
  canDecide?: boolean;
}

export interface DecisionView {
  id: string;
  decidedBy: string;
  decidedByRole: Role;
  decision: Decision;
  answer: string | null;
  reason: string | null;
  createdAt: string;
}

export function toDecisionView(row: DecisionRow): DecisionView {
  return {
    id: row.id,
    decidedBy: row.decided_by,
    decidedByRole: row.decided_by_role,
    decision: row.decision,
    answer: row.answer,
    reason: row.reason,
    createdAt: row.created_at,
  };
}
