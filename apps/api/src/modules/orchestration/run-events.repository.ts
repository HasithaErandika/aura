import { dbError } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { RunEvent, RunEventStore } from "./run-events.js";

async function lastIdWhere(runId: string, event?: string): Promise<number> {
  let query = supabaseAdmin.from("run_events").select("id").eq("run_id", runId);
  if (event) query = query.eq("event", event);
  const { data, error } = await query.order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw dbError("read run events", error);
  return data ? Number((data as { id: number }).id) : 0;
}

export const supabaseRunEventStore: RunEventStore = {
  async append(runId, event, data) {
    const { data: row, error } = await supabaseAdmin.from("run_events").insert({ run_id: runId, event, data: data ?? null }).select("id").single();
    if (error || !row) throw dbError("store run event", error ?? { message: "no row returned" });
    return Number((row as { id: number }).id);
  },

  async listAfter(runId, afterId, limit) {
    const { data, error } = await supabaseAdmin.from("run_events").select("id, event, data").eq("run_id", runId).gt("id", afterId).order("id").limit(limit);
    if (error) throw dbError("read run events", error);
    return ((data ?? []) as { id: number; event: string; data: unknown }[]).map((r): RunEvent => ({ id: Number(r.id), runId, event: r.event, data: r.data }));
  },

  lastId: (runId) => lastIdWhere(runId),

  lastIdOf: (runId, event) => lastIdWhere(runId, event),
};
