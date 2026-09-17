import { supabaseAdmin } from "../../lib/supabase.js";
import type { Role } from "../identity/roles.js";
import type { AskUserOption } from "../runtime/runtime.types.js";
import type { ApprovalRow, ApprovalStatus, Decision, DecisionRow } from "./approvals.types.js";

const APPROVAL_COLUMNS =
  "id, run_id, thread_id, agent_id, runtime_run_id, tool_call_id, producing_agent, required_role, requested_by, question, options, selection_mode, snapshot, snapshot_hash, status, requested_at, expires_at, decided_at";

function dbError(context: string, error: { message: string; code?: string }): Error {
  const hint =
    error.code === "42P01" || /relation .* does not exist/i.test(error.message)
      ? " (apply supabase/migrations/0002_runs_approvals_audit.sql)"
      : "";
  return new Error(`${context}: ${error.message}${hint}`);
}

export interface ApprovalFilter {
  status?: ApprovalStatus[];
  requiredRole?: Role;
  requestedBy?: string;
  runId?: string;
  threadId?: string;
  limit: number;
}

export const approvalsRepository = {
  async create(input: {
    runId: string;
    threadId: string;
    agentId: string;
    runtimeRunId: string;
    toolCallId: string;
    producingAgent: string | null;
    requiredRole: Role | null;
    requestedBy: string;
    question: string;
    options: AskUserOption[] | null;
    selectionMode: string | null;
    snapshot: string | null;
    snapshotHash: string;
    expiresAt: string;
  }): Promise<ApprovalRow> {
    const { data, error } = await supabaseAdmin
      .from("approval_requests")
      .insert({
        run_id: input.runId,
        thread_id: input.threadId,
        agent_id: input.agentId,
        runtime_run_id: input.runtimeRunId,
        tool_call_id: input.toolCallId,
        producing_agent: input.producingAgent,
        required_role: input.requiredRole,
        requested_by: input.requestedBy,
        question: input.question,
        options: input.options,
        selection_mode: input.selectionMode,
        snapshot: input.snapshot,
        snapshot_hash: input.snapshotHash,
        status: "PENDING",
        expires_at: input.expiresAt,
      })
      .select(APPROVAL_COLUMNS)
      .single();
    if (error) throw dbError("create approval", error);
    return data as ApprovalRow;
  },

  async findById(id: string): Promise<ApprovalRow | null> {
    const { data, error } = await supabaseAdmin.from("approval_requests").select(APPROVAL_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw dbError("find approval", error);
    return (data as ApprovalRow | null) ?? null;
  },

  async list(filter: ApprovalFilter): Promise<ApprovalRow[]> {
    let builder = supabaseAdmin
      .from("approval_requests")
      .select(APPROVAL_COLUMNS)
      .order("requested_at", { ascending: false })
      .limit(filter.limit);
    if (filter.status?.length) builder = builder.in("status", filter.status);
    if (filter.requiredRole) builder = builder.eq("required_role", filter.requiredRole);
    if (filter.requestedBy) builder = builder.eq("requested_by", filter.requestedBy);
    if (filter.runId) builder = builder.eq("run_id", filter.runId);
    if (filter.threadId) builder = builder.eq("thread_id", filter.threadId);
    const { data, error } = await builder;
    if (error) throw dbError("list approvals", error);
    return (data ?? []) as ApprovalRow[];
  },

  // Approvals a user may act on or watch: those requiring their role, plus clarification
  // questions (no role) on runs they started, plus anything on their own runs for context.
  async listForUser(userId: string, role: Role, status: ApprovalStatus[] | undefined, limit: number): Promise<ApprovalRow[]> {
    let builder = supabaseAdmin
      .from("approval_requests")
      .select(APPROVAL_COLUMNS)
      .or(`required_role.eq.${role},requested_by.eq.${userId}`)
      .order("requested_at", { ascending: false })
      .limit(limit);
    if (status?.length) builder = builder.in("status", status);
    const { data, error } = await builder;
    if (error) throw dbError("list approvals for user", error);
    return (data ?? []) as ApprovalRow[];
  },

  // Atomic transition guarded on the previous status so two approvers cannot both win.
  async transition(id: string, from: ApprovalStatus, to: ApprovalStatus): Promise<ApprovalRow | null> {
    const { data, error } = await supabaseAdmin
      .from("approval_requests")
      .update({ status: to, decided_at: to === "PENDING" ? null : new Date().toISOString() })
      .eq("id", id)
      .eq("status", from)
      .select(APPROVAL_COLUMNS)
      .maybeSingle();
    if (error) throw dbError("transition approval", error);
    return (data as ApprovalRow | null) ?? null;
  },

  async expirePending(now: string): Promise<ApprovalRow[]> {
    const { data, error } = await supabaseAdmin
      .from("approval_requests")
      .update({ status: "EXPIRED", decided_at: now })
      .eq("status", "PENDING")
      .lt("expires_at", now)
      .select(APPROVAL_COLUMNS);
    if (error) throw dbError("expire approvals", error);
    return (data ?? []) as ApprovalRow[];
  },

  async recordDecision(input: {
    approvalId: string;
    decidedBy: string;
    decidedByRole: Role;
    decision: Decision;
    answer: string | null;
    reason: string | null;
    snapshotHash: string;
  }): Promise<DecisionRow> {
    const { data, error } = await supabaseAdmin
      .from("approval_decisions")
      .insert({
        approval_id: input.approvalId,
        decided_by: input.decidedBy,
        decided_by_role: input.decidedByRole,
        decision: input.decision,
        answer: input.answer,
        reason: input.reason,
        snapshot_hash: input.snapshotHash,
      })
      .select("id, approval_id, decided_by, decided_by_role, decision, answer, reason, snapshot_hash, created_at")
      .single();
    if (error) throw dbError("record decision", error);
    return data as DecisionRow;
  },

  async decisionsFor(approvalIds: string[]): Promise<DecisionRow[]> {
    if (approvalIds.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("approval_decisions")
      .select("id, approval_id, decided_by, decided_by_role, decision, answer, reason, snapshot_hash, created_at")
      .in("approval_id", approvalIds)
      .order("created_at", { ascending: false });
    if (error) throw dbError("list decisions", error);
    return (data ?? []) as DecisionRow[];
  },

  async countPending(filter: { requiredRole?: Role; requestedBy?: string }): Promise<number> {
    let builder = supabaseAdmin.from("approval_requests").select("id", { count: "exact", head: true }).eq("status", "PENDING");
    if (filter.requiredRole) builder = builder.eq("required_role", filter.requiredRole);
    if (filter.requestedBy) builder = builder.eq("requested_by", filter.requestedBy);
    const { count, error } = await builder;
    if (error) throw dbError("count approvals", error);
    return count ?? 0;
  },
};
