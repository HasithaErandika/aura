import { badRequest, conflict, notFound } from "../../lib/http/errors.js";
import type { AuthedUser } from "../../middleware/auth.js";
import { profilesById } from "../identity/profiles.service.js";
import { canDecide, gateInfoForPause, resolveApprover } from "../policy/policy.js";
import { runsRepository } from "../runs/runs.repository.js";
import { approvalsRepository } from "./approvals.repository.js";
import { toDecisionView, type ApprovalRow, type ApprovalStatus, type ApprovalView, type Decision } from "./approvals.types.js";
import { writeAudit } from "../audit/audit.service.js";

function scopeOf(row: ApprovalRow) {
  return resolveApprover(row.producing_agent, row.requested_by);
}

export async function toApprovalView(row: ApprovalRow, viewer: AuthedUser): Promise<ApprovalView> {
  const [views] = await toApprovalViews([row], viewer);
  return views;
}

export async function toApprovalViews(rows: ApprovalRow[], viewer: AuthedUser): Promise<ApprovalView[]> {
  const [profiles, decisions] = await Promise.all([
    profilesById(rows.map((r) => r.requested_by)),
    approvalsRepository.decisionsFor(rows.filter((r) => r.status !== "PENDING").map((r) => r.id)),
  ]);
  const decisionByApproval = new Map<string, (typeof decisions)[number]>();
  for (const d of decisions) if (!decisionByApproval.has(d.approval_id)) decisionByApproval.set(d.approval_id, d);

  return rows.map((row) => {
    const gate = gateInfoForPause(row.producing_agent, row.options);
    const requester = profiles.get(row.requested_by);
    const decision = decisionByApproval.get(row.id);
    return {
      id: row.id,
      runId: row.run_id,
      threadId: row.thread_id,
      agentId: row.agent_id,
      producingAgent: row.producing_agent,
      gate: gate ? { number: gate.gate, name: gate.name, outcome: gate.outcome } : null,
      requiredRole: row.required_role,
      requestedBy: row.requested_by,
      requester: requester ? { fullName: requester.fullName, email: requester.email } : null,
      question: row.question,
      options: row.options ?? [],
      selectionMode: row.selection_mode === "multi_select" ? "multi_select" : row.selection_mode === "single_select" ? "single_select" : null,
      snapshot: row.snapshot,
      snapshotHash: row.snapshot_hash,
      status: row.status,
      requestedAt: row.requested_at,
      expiresAt: row.expires_at,
      decidedAt: row.decided_at,
      decision: decision ? toDecisionView(decision) : null,
      canDecide: row.status === "PENDING" && canDecide(viewer, scopeOf(row)),
    };
  });
}

// Lazily expire overdue gates on read. Deterministic and idempotent; never auto-approves.
// Throttled so polling clients do not turn every list call into an UPDATE.
const EXPIRY_SWEEP_INTERVAL_MS = 60_000;
let lastSweepAt = 0;

export async function expireOverdue(force = false): Promise<void> {
  if (!force && Date.now() - lastSweepAt < EXPIRY_SWEEP_INTERVAL_MS) return;
  lastSweepAt = Date.now();
  const now = new Date().toISOString();
  const expired = await approvalsRepository.expirePending(now);
  for (const approval of expired) {
    await runsRepository.update(approval.run_id, { status: "EXPIRED", finished_at: now, last_error: "Approval SLA elapsed" });
    await writeAudit({
      actorId: null,
      actorRole: null,
      action: "approval.expired",
      entityType: "approval_request",
      entityId: approval.id,
      metadata: { runId: approval.run_id },
    });
  }
}

const STATUS_FOR_DECISION: Record<Decision, ApprovalStatus> = {
  approve: "APPROVED",
  reject: "REJECTED",
  revise: "REVISION_REQUESTED",
  answer: "ANSWERED",
};

// Builds the exact string handed back to the runtime's ask_user tool. The Orchestrator reads
// it as the human's answer; the wording stays close to what a person would type so the
// model does not have to interpret a code.
export function buildResumeData(approval: ApprovalRow, decision: Decision, answer: string | null, reason: string | null): string {
  const options = approval.options ?? [];
  const pick = (pattern: RegExp) => options.find((o) => pattern.test(o.label) || (o.value ? pattern.test(o.value) : false));

  switch (decision) {
    case "approve": {
      const label = answer ?? pick(/approve|accept|yes|continue|proceed/i)?.label ?? "approve";
      return reason ? `${label}. Note: ${reason}` : label;
    }
    case "revise": {
      const label = answer ?? pick(/revis|change|edit|feedback/i)?.label ?? "revise";
      return `${label}. Feedback: ${reason}`;
    }
    case "reject": {
      const label = answer ?? pick(/reject|decline|no|stop|cancel/i)?.label ?? "reject";
      return `${label}. Reason: ${reason}`;
    }
    case "answer":
      return answer ?? "";
  }
}

export interface DecideInput {
  approvalId: string;
  user: AuthedUser;
  decision: Decision;
  answer: string | null;
  reason: string | null;
  snapshotHash: string | null;
  requestId: string;
}

export interface DecideResult {
  approval: ApprovalRow;
  resumeData: string;
}

// Records the decision and locks the approval. Resuming the runtime happens in the router so
// the caller can receive the continuation as a stream.
export async function decide(input: DecideInput): Promise<DecideResult> {
  const approval = await approvalsRepository.findById(input.approvalId);
  if (!approval) throw notFound("Approval request");
  if (approval.status !== "PENDING") throw conflict(`This request was already ${approval.status.toLowerCase().replace("_", " ")}`);
  if (new Date(approval.expires_at).getTime() < Date.now()) {
    await expireOverdue(true);
    throw conflict("This request has expired");
  }

  const scope = scopeOf(approval);
  if (!canDecide(input.user, scope)) {
    throw badRequest(
      scope.requiredRole ? `This decision requires the ${scope.requiredRole} role` : "Only the requester can answer this question",
    );
  }

  // Bind the decision to what the human actually reviewed (FR-APPR-3).
  if (input.snapshotHash && input.snapshotHash !== approval.snapshot_hash) {
    throw conflict("The content you reviewed has changed. Reload and review again before deciding.");
  }
  if ((input.decision === "reject" || input.decision === "revise") && !input.reason) {
    throw badRequest(`A reason is required to ${input.decision}`);
  }
  if (input.decision === "answer" && !input.answer) {
    throw badRequest("An answer is required");
  }

  const locked = await approvalsRepository.transition(approval.id, "PENDING", STATUS_FOR_DECISION[input.decision]);
  if (!locked) throw conflict("Someone else decided this request first");

  await approvalsRepository.recordDecision({
    approvalId: approval.id,
    decidedBy: input.user.id,
    decidedByRole: input.user.role,
    decision: input.decision,
    answer: input.answer,
    reason: input.reason,
    snapshotHash: approval.snapshot_hash,
  });

  await writeAudit({
    actorId: input.user.id,
    actorRole: input.user.role,
    action: `approval.${input.decision === "answer" ? "answered" : input.decision === "approve" ? "approved" : input.decision === "reject" ? "rejected" : "revision_requested"}`,
    entityType: "approval_request",
    entityId: approval.id,
    requestId: input.requestId,
    metadata: { runId: approval.run_id, producingAgent: approval.producing_agent, snapshotHash: approval.snapshot_hash },
  });

  return { approval: locked, resumeData: buildResumeData(approval, input.decision, input.answer, input.reason) };
}
