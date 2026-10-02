import type { Role } from "../../lib/auth/roles.js";
import { dbError } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { ProfileRow, ProfileSummary } from "./identity.types.js";

const PAGE_SIZE = 1000;

export const profilesRepository = {
  async find(id: string): Promise<ProfileRow | null> {
    const { data, error } = await supabaseAdmin.from("profiles").select("id, email, full_name, role, created_at").eq("id", id).maybeSingle();
    if (error) throw dbError("find profile", error);
    return (data as ProfileRow | null) ?? null;
  },

  async byIds(ids: string[]): Promise<ProfileSummary[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids);
    if (error) throw dbError("profiles lookup", error);
    return ((data ?? []) as Pick<ProfileRow, "id" | "full_name" | "email">[]).map((row) => ({ id: row.id, fullName: row.full_name, email: row.email }));
  },

  async listAll(): Promise<ProfileRow[]> {
    const profiles: ProfileRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabaseAdmin.from("profiles").select("id, email, full_name, role, created_at").range(from, from + PAGE_SIZE - 1);
      if (error) throw dbError("list profiles", error);
      const rows = (data ?? []) as ProfileRow[];
      profiles.push(...rows);
      if (rows.length < PAGE_SIZE) return profiles;
    }
  },

  async idWithEmailAndRole(email: string, role: Role): Promise<string | null> {
    const { data, error } = await supabaseAdmin.from("profiles").select("id").ilike("email", email).eq("role", role).limit(1);
    if (error) throw dbError("find user by email", error);
    return ((data ?? []) as { id: string }[])[0]?.id ?? null;
  },

  async idsWithRole(role: Role): Promise<string[]> {
    const { data, error } = await supabaseAdmin.from("profiles").select("id").eq("role", role);
    if (error) throw dbError("list users by role", error);
    return ((data ?? []) as { id: string }[]).map((row) => row.id);
  },

  async insert(input: { id: string; email: string; fullName: string; role: Role }): Promise<void> {
    const { error } = await supabaseAdmin.from("profiles").insert({ id: input.id, email: input.email, full_name: input.fullName, role: input.role });
    if (error) throw dbError("create profile", error);
  },

  async updateRole(id: string, role: Role): Promise<void> {
    const { error } = await supabaseAdmin.from("profiles").update({ role }).eq("id", id);
    if (error) throw dbError("update role", error);
  },
};
