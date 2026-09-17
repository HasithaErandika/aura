import { supabaseAdmin } from "../../lib/supabase.js";

export interface ProfileSummary {
  id: string;
  fullName: string | null;
  email: string;
}

// Batched lookup used to attach requester and approver names to runs and approvals.
export async function profilesById(ids: string[]): Promise<Map<string, ProfileSummary>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, ProfileSummary>();
  if (unique.length === 0) return map;
  const { data, error } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", unique);
  if (error) throw new Error(`profiles lookup failed: ${error.message}`);
  for (const row of (data ?? []) as Array<{ id: string; full_name: string | null; email: string }>) {
    map.set(row.id, { id: row.id, fullName: row.full_name, email: row.email });
  }
  return map;
}
