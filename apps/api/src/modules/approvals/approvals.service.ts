import type { AuthedUser } from "../../lib/auth/user.js";
import { badRequest, conflict, forbidden, notFound } from "../../lib/http/errors.js";
import { writeAudit } from "../audit/index.js";
import { peopleById } from "../identity/index.js";
import { assertCanDecide, canDecide, canViewApproval, gateInfoForPause, resolveApprover } from "../policy/index.js";
import { requireRun, runsRepository } from "../runs/index.js";
import { approvalsRepository } from "./approvals.repository.js";
import {
  selectionModeOf,
  toDecisionView,
  toGateView,
  type ApprovalRow,
  type ApprovalStatus,
  type ApprovalView,
  type Decision,
  type DecisionRow,
} from "./approvals.types.js";

const EXPIRY_SWEEP_INTERVAL_MS = 60_000;
const RUN_APPROVALS_LIMIT = 50;
let lastSweepAt = 0;

const STATUS_FOR_DECISION: Record<Decision, ApprovalStatus> = {
  approve: "APPROVED",
  reject: "REJECTED",
  revise: "REVISION_REQUESTED",
  answer: "ANSWERED",
};

const AUDIT_ACTION: Record<Decision, string> = {
  approve: "approval.approved",
  reject: "approval.rejected",
  revise: "approval.revision_requested",
  answer: "approval.answered",
};

const scopeOf = (row: ApprovalRow) => resolveApprover(row.producing_agent, row.requested_by);

export async function toApprovalViews(rows: ApprovalRow[], viewer: AuthedUser): Promise<ApprovalView[]> {
  const [person, decisions] = await Promise.all([
    peopleById(rows.map((r) => r.requested_by)),
    approvalsRepository.decisionsFor(rows.filter((r) => r.status !== "PENDING").map((r) => r.id)),
  ]);
  const latest = new Map<string, DecisionRow>();
  for (const d of decisions) if (!latest.has(d.approval_id)) latest.set(d.approval_id, d);

  return rows.map((row) => {
    const decision = latest.get(row.id);
    return {
      id: row.id,
      runId: row.run_id,
      threadId: row.thread_id,
      agentId: row.agent_id,
      producingAgent: row.producing_agent,
      gate: toGateView(gateInfoForPause(row.producing_agent, row.options)),
      requiredRole: row.required_role,
      requestedBy: row.requested_by,
      requester: person(row.requested_by),
      question: row.question,
      options: row.options ?? [],
      selectionMode: selectionModeOf(row.selection_mode),
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

export async function approvalViewsForRun(runId: string, viewer: AuthedUser): Promise<ApprovalView[]> {
  return toApprovalViews(await approvalsRepository.list({ runId, limit: RUN_APPROVALS_LIMIT }), viewer);
}

export async function pendingApprovalForThread(threadId: string, viewer: AuthedUser): Promise<ApprovalView | null> {
  const [pending] = await approvalsRepository.list({ threadId, status: ["PENDING"], limit: 1 });
  return pending ? ((await toApprovalViews([pending], viewer))[0] ?? null) : null;
}

export function listInbox(user: AuthedUser, status: ApprovalStatus[] | undefined, limit: number): Promise<ApprovalRow[]> {
  return user.role === "admin" ? approvalsRepository.list({ status, limit }) : approvalsRepository.listForUser(user.id, user.role, status, limit);
}

export async function getApprovalForViewer(id: string, user: AuthedUser) {
  const row = await approvalsRepository.findById(id);
  if (!row) throw notFound("Approval request");
  if (!canViewApproval(user, scopeOf(row))) throw forbidden("You cannot view this approval request");
  const [[approval], run] = await Promise.all([toApprovalViews([row], user), runsRepository.findById(row.run_id)]);
  return { approval: approval!, run: run ? { id: run.id, title: run.title, status: run.status, threadId: run.thread_id } : null };
}

export async function approvalCounts(user: AuthedUser): Promise<{ pendingForMyRole: number; pendingOnMyRuns: number }> {
  const [pendingForMyRole, pendingOnMyRuns] = await Promise.all([
    user.role === "admin" ? approvalsRepository.countPending({}) : approvalsRepository.countPendingForUser(user.id, user.role),
    approvalsRepository.countPending({ requestedBy: user.id }),
  ]);
  return { pendingForMyRole, pendingOnMyRuns };
}

// Admins see every pending gate read-only; others only the gates they can decide.
export async function decisionsNeeded(user: AuthedUser, max: number): Promise<ApprovalView[]> {
  if (user.role === "admin") return toApprovalViews(await approvalsRepository.list({ status: ["PENDING"], limit: max }), user);
  const views = await toApprovalViews(await approvalsRepository.listForUser(user.id, user.role, ["PENDING"], max * 5), user);
  return views.filter((a) => a.canDecide).slice(0, max);
}

export const createApprovalRequest = approvalsRepository.create;

// Never auto-approves; throttled so polling clients do not turn every read into an UPDATE.
export async function expireOverdue(force = false): Promise<void> {
  if (!force && Date.now() - lastSweepAt < EXPIRY_SWEEP_INTERVAL_MS) return;
  lastSweepAt = Date.now();
  const now = new Date().toISOString();
  for (const approval of await approvalsRepository.expirePending(now)) {
    await runsRepository.update(approval.run_id, { status: "EXPIRED", finished_at: now, last_error: "Approval SLA elapsed" });
    await writeAudit({ actorId: null, actorRole: null, action: "approval.expired", entityType: "approval_request", entityId: approval.id, metadata: { runId: approval.run_id } });
  }
}

// The string handed back to the runtime's ask_user tool, worded like a person's answer.
export function buildResumeData(options: ApprovalRow["options"], decision: Decision, answer: string | null, reason: string | null): string {
  const pick = (pattern: RegExp) => (options ?? []).find((o) => pattern.test(o.label) || (o.value ? pattern.test(o.value) : false))?.label;
  switch (decision) {
    case "approve": {
      const label = answer ?? pick(/approve|accept|yes|continue|proceed/i) ?? "approve";
      return reason ? `${label}. Note: ${reason}` : label;
    }
    case "revise":
      return `${answer ?? pick(/revis|change|edit|feedback/i) ?? "revise"}. Feedback: ${reason}`;
    case "reject":
      return `${answer ?? pick(/reject|decline|no|stop|cancel/i) ?? "reject"}. Reason: ${reason}`;
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

export function validateDecision(input: Pick<DecideInput, "decision" | "answer" | "reason">): void {
  if ((input.decision === "reject" || input.decision === "revise") && !input.reason) throw badRequest(`A reason is required to ${input.decision}`);
  if (input.decision === "answer" && !input.answer) throw badRequest("An answer is required");
}

export async function decide(input: DecideInput): Promise<{ approval: ApprovalRow; resumeData: string }> {
  const approval = await approvalsRepository.findById(input.approvalId);
  if (!approval) throw notFound("Approval request");
  assertCanDecide(input.user, scopeOf(approval));
  if (approval.status !== "PENDING") throw conflict(`This request was already ${approval.status.toLowerCase().replace(/_/g, " ")}`);
  if (new Date(approval.expires_at).getTime() < Date.now()) {
    await expireOverdue(true);
    throw conflict("This request has expired");
  }
  if (input.snapshotHash && input.snapshotHash !== approval.snapshot_hash) throw conflict("The content you reviewed has changed. Reload and review again before deciding.");
  validateDecision(input);
  await requireRun(approval.run_id);

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
    action: AUDIT_ACTION[input.decision],
    entityType: "approval_request",
    entityId: approval.id,
    requestId: input.requestId,
    metadata: { runId: approval.run_id, producingAgent: approval.producing_agent, snapshotHash: approval.snapshot_hash },
  });
  return { approval: locked, resumeData: buildResumeData(approval.options, input.decision, input.answer, input.reason) };
}
