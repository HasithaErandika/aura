import { dbError } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { QualityInputRow } from "./quality.service.js";

const QUALITY_ROW_LIMIT = 5000;

export const dashboardRepository = {
  async approvalsSince(since: string): Promise<QualityInputRow[]> {
    const { data, error } = await supabaseAdmin
      .from("approval_requests")
      .select("producing_agent, thread_id, status, requested_at, decided_at, approval_decisions (decision, created_at)")
      .gte("requested_at", since)
      .limit(QUALITY_ROW_LIMIT);
    if (error) throw dbError("agent quality", error);
    return (data ?? []) as unknown as QualityInputRow[];
  },
};
