import { supabaseAdmin } from "../../lib/supabase.js";

export interface ProfileSummary {
  id: string;
  fullName: string | null;
  email: string;
}

export interface GitIdentity {
  name: string | null;
  email: string | null;
}

// The name/email a user set for commits AURA makes on their behalf (PUT /me/git-identity).
export async function gitIdentityFor(userId: string): Promise<GitIdentity> {
  const { data, error } = await supabaseAdmin.from("profiles").select("git_name, git_email").eq("id", userId).single();
  if (error || !data) return { name: null, email: null };
  return { name: data.git_name ?? null, email: data.git_email ?? null };
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
