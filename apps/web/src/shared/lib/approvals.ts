import type { Approval, PendingGate } from "../api/types.ts";

export function toPendingGate(a: Approval): PendingGate {
  return {
    approvalId: a.id,
    runId: a.runId,
    producingAgent: a.producingAgent,
    gate: a.gate,
    requiredRole: a.requiredRole,
    question: a.question,
    options: a.options,
    selectionMode: a.selectionMode,
    snapshot: a.snapshot,
    snapshotHash: a.snapshotHash,
    expiresAt: a.expiresAt,
    canDecide: Boolean(a.canDecide),
  };
}

export function countPending(approvals: Approval[]): { pending: number; mine: number } {
  const pending = approvals.filter((a) => a.status === "PENDING");
  return { pending: pending.length, mine: pending.filter((a) => a.canDecide).length };
}
