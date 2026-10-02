import type { Role } from "../../lib/auth/roles.js";
import { dbError, orValue } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import { RUN_STATUSES, type NewRunStep, type RunRow, type RunStatus, type RunStepRow } from "./runs.types.js";

const RUN_COLUMNS =
  "id, agent_id, thread_id, runtime_run_id, requested_by, requested_by_role, status, current_agent, agents_involved, title, input_summary, output_summary, last_error, started_at, finished_at, updated_at";
const STEP_COLUMNS = "id, run_id, seq, kind, tool_name, tool_call_id, payload, created_at";

export interface RunFilter {
  requestedBy?: string;
  status?: RunStatus[];
  threadId?: string;
  limit: number;
}

export const runsRepository = {
  async create(input: { agentId: string; threadId: string; requestedBy: string; requestedByRole: Role; title: string | null; inputSummary: string }): Promise<RunRow> {
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

  async touch(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from("workflow_runs").update({ updated_at: new Date().toISOString() }).eq("id", id).eq("status", "RUNNING");
    if (error) throw dbError("touch run", error);
  },

  async listStale(before: string): Promise<RunRow[]> {
    const { data, error } = await supabaseAdmin.from("workflow_runs").select(RUN_COLUMNS).eq("status", "RUNNING").lt("updated_at", before).limit(100);
    if (error) throw dbError("list stale runs", error);
    return (data ?? []) as RunRow[];
  },

  async countActiveForUser(userId: string): Promise<number> {
    const { count, error } = await supabaseAdmin.from("workflow_runs").select("id", { count: "exact", head: true }).eq("requested_by", userId).in("status", ["PENDING", "RUNNING"]);
    if (error) throw dbError("count active runs", error);
    return count ?? 0;
  },

  async findById(id: string): Promise<RunRow | null> {
    const { data, error } = await supabaseAdmin.from("workflow_runs").select(RUN_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw dbError("find run", error);
    return (data as RunRow | null) ?? null;
  },

  async findLatestForThread(threadId: string): Promise<RunRow | null> {
    const { data, error } = await supabaseAdmin.from("workflow_runs").select(RUN_COLUMNS).eq("thread_id", threadId).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw dbError("find latest run for thread", error);
    return (data as RunRow | null) ?? null;
  },

  async list(filter: RunFilter): Promise<RunRow[]> {
    let query = supabaseAdmin.from("workflow_runs").select(RUN_COLUMNS);
    if (filter.requestedBy) query = query.eq("requested_by", filter.requestedBy);
    if (filter.status?.length) query = query.in("status", filter.status);
    if (filter.threadId) query = query.eq("thread_id", filter.threadId);
    const { data, error } = await query.order("started_at", { ascending: false }).limit(filter.limit);
    if (error) throw dbError("list runs", error);
    return (data ?? []) as RunRow[];
  },

  // A non-admin sees their own runs plus runs waiting on an agent their role approves.
  async listVisibleTo(userId: string, approverOfAgents: string[], filter: { status?: RunStatus[]; limit: number }): Promise<RunRow[]> {
    const clauses = [`requested_by.eq.${orValue(userId, "userId")}`];
    if (approverOfAgents.length) clauses.push(`current_agent.in.(${approverOfAgents.map((id) => orValue(id, "agentId")).join(",")})`);
    let query = supabaseAdmin.from("workflow_runs").select(RUN_COLUMNS).or(clauses.join(","));
    if (filter.status?.length) query = query.in("status", filter.status);
    const { data, error } = await query.order("started_at", { ascending: false }).limit(filter.limit);
    if (error) throw dbError("list visible runs", error);
    return (data ?? []) as RunRow[];
  },

  async countByStatus(filter: { requestedBy?: string }): Promise<Record<RunStatus, number>> {
    const counts = await Promise.all(
      RUN_STATUSES.map(async (status) => {
        let query = supabaseAdmin.from("workflow_runs").select("id", { count: "exact", head: true }).eq("status", status);
        if (filter.requestedBy) query = query.eq("requested_by", filter.requestedBy);
        const { count, error } = await query;
        if (error) throw dbError("count runs", error);
        return [status, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(counts) as Record<RunStatus, number>;
  },

  async addSteps(rows: NewRunStep[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await supabaseAdmin.from("run_steps").insert(
      rows.map((r) => ({ run_id: r.runId, seq: r.seq, kind: r.kind, tool_name: r.toolName ?? null, tool_call_id: r.toolCallId ?? null, payload: r.payload ?? null })),
    );
    if (error) throw dbError("add run steps", error);
  },

  async nextSeq(runId: string): Promise<number> {
    const { data, error } = await supabaseAdmin.from("run_steps").select("seq").eq("run_id", runId).order("seq", { ascending: false }).limit(1).maybeSingle();
    if (error) throw dbError("read run step seq", error);
    return ((data as { seq: number } | null)?.seq ?? 0) + 1;
  },

  async listSteps(runId: string): Promise<RunStepRow[]> {
    const { data, error } = await supabaseAdmin.from("run_steps").select(STEP_COLUMNS).eq("run_id", runId).order("seq", { ascending: true });
    if (error) throw dbError("list run steps", error);
    return (data ?? []) as RunStepRow[];
  },
};
