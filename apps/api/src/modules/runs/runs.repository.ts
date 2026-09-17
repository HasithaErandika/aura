import { supabaseAdmin } from "../../lib/supabase.js";
import type { Role } from "../identity/roles.js";
import type { RunRow, RunStatus, RunStepKind, RunStepRow } from "./runs.types.js";

const RUN_COLUMNS =
  "id, agent_id, thread_id, runtime_run_id, requested_by, requested_by_role, status, current_agent, agents_involved, title, input_summary, output_summary, last_error, started_at, finished_at, updated_at";

function dbError(context: string, error: { message: string; code?: string }): Error {
  const hint =
    error.code === "42P01" || /relation .* does not exist/i.test(error.message)
      ? " (apply supabase/migrations/0002_runs_approvals_audit.sql)"
      : "";
  return new Error(`${context}: ${error.message}${hint}`);
}

export interface RunFilter {
  requestedBy?: string;
  status?: RunStatus[];
  threadId?: string;
  currentAgentIn?: string[];
  limit: number;
}

export const runsRepository = {
  async create(input: {
    agentId: string;
    threadId: string;
    requestedBy: string;
    requestedByRole: Role;
    title: string | null;
    inputSummary: string;
  }): Promise<RunRow> {
    const { data, error } = await supabaseAdmin
      .from("workflow_runs")
      .insert({
        agent_id: input.agentId,
        thread_id: input.threadId,
        requested_by: input.requestedBy,
        requested_by_role: input.requestedByRole,
        status: "PENDING",
        title: input.title,
        input_summary: input.inputSummary,
        agents_involved: [],
      })
      .select(RUN_COLUMNS)
      .single();
    if (error) throw dbError("create run", error);
    return data as RunRow;
  },

  async update(id: string, patch: Partial<Omit<RunRow, "id">>): Promise<RunRow> {
    const { data, error } = await supabaseAdmin
      .from("workflow_runs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(RUN_COLUMNS)
      .single();
    if (error) throw dbError("update run", error);
    return data as RunRow;
  },

  async findById(id: string): Promise<RunRow | null> {
    const { data, error } = await supabaseAdmin.from("workflow_runs").select(RUN_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw dbError("find run", error);
    return (data as RunRow | null) ?? null;
  },

  async findLatestForThread(threadId: string): Promise<RunRow | null> {
    const { data, error } = await supabaseAdmin
      .from("workflow_runs")
      .select(RUN_COLUMNS)
      .eq("thread_id", threadId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw dbError("find latest run for thread", error);
    return (data as RunRow | null) ?? null;
  },

  async list(filter: RunFilter): Promise<RunRow[]> {
    let builder = supabaseAdmin.from("workflow_runs").select(RUN_COLUMNS).order("started_at", { ascending: false }).limit(filter.limit);
    if (filter.requestedBy) builder = builder.eq("requested_by", filter.requestedBy);
    if (filter.status?.length) builder = builder.in("status", filter.status);
    if (filter.threadId) builder = builder.eq("thread_id", filter.threadId);
    const { data, error } = await builder;
    if (error) throw dbError("list runs", error);
    return (data ?? []) as RunRow[];
  },

  // Runs visible to a non-admin: their own, plus runs currently waiting on an agent whose
  // output their role approves.
  async listVisibleTo(userId: string, approverOfAgents: string[], limit: number): Promise<RunRow[]> {
    const clauses = [`requested_by.eq.${userId}`];
    if (approverOfAgents.length) clauses.push(`current_agent.in.(${approverOfAgents.join(",")})`);
    const { data, error } = await supabaseAdmin
      .from("workflow_runs")
      .select(RUN_COLUMNS)
      .or(clauses.join(","))
      .order("started_at", { ascending: false })
      .limit(limit);
    if (error) throw dbError("list visible runs", error);
    return (data ?? []) as RunRow[];
  },

  // Server-side counts per status group; nothing is transferred but the numbers.
  async countByStatus(filter: { requestedBy?: string }): Promise<Record<RunStatus, number>> {
    const statuses: RunStatus[] = ["PENDING", "RUNNING", "SUSPENDED_FOR_APPROVAL", "SUCCEEDED", "FAILED", "REJECTED", "EXPIRED", "HALTED_LOOP_GUARD"];
    const results = await Promise.all(
      statuses.map(async (status) => {
        let builder = supabaseAdmin.from("workflow_runs").select("id", { count: "exact", head: true }).eq("status", status);
        if (filter.requestedBy) builder = builder.eq("requested_by", filter.requestedBy);
        const { count, error } = await builder;
        if (error) throw dbError("count runs", error);
        return [status, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(results) as Record<RunStatus, number>;
  },

  async addStep(input: {
    runId: string;
    seq: number;
    kind: RunStepKind;
    toolName?: string | null;
    toolCallId?: string | null;
    payload?: Record<string, unknown> | null;
  }): Promise<void> {
    const { error } = await supabaseAdmin.from("run_steps").insert({
      run_id: input.runId,
      seq: input.seq,
      kind: input.kind,
      tool_name: input.toolName ?? null,
      tool_call_id: input.toolCallId ?? null,
      payload: input.payload ?? null,
    });
    if (error) throw dbError("add run step", error);
  },

  async addSteps(
    rows: Array<{
      runId: string;
      seq: number;
      kind: RunStepKind;
      toolName?: string | null;
      toolCallId?: string | null;
      payload?: Record<string, unknown> | null;
    }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await supabaseAdmin.from("run_steps").insert(
      rows.map((r) => ({
        run_id: r.runId,
        seq: r.seq,
        kind: r.kind,
        tool_name: r.toolName ?? null,
        tool_call_id: r.toolCallId ?? null,
        payload: r.payload ?? null,
      })),
    );
    if (error) throw dbError("add run steps", error);
  },

  async nextSeq(runId: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from("run_steps")
      .select("seq")
      .eq("run_id", runId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw dbError("read run step seq", error);
    return ((data as { seq: number } | null)?.seq ?? 0) + 1;
  },

  async listSteps(runId: string): Promise<RunStepRow[]> {
    const { data, error } = await supabaseAdmin
      .from("run_steps")
      .select("id, run_id, seq, kind, tool_name, tool_call_id, payload, created_at")
      .eq("run_id", runId)
      .order("seq", { ascending: true });
    if (error) throw dbError("list run steps", error);
    return (data ?? []) as RunStepRow[];
  },
};
