import { dbError, orValue } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { SettingScope, SettingValue } from "./settings.registry.js";
import type { SettingTarget } from "./settings.resolve.js";
import type { SettingRow } from "./settings.types.js";

const COLUMNS = "scope, scope_id, key, value, updated_by, updated_at";

export const settingsRepository = {
  async list(scope: SettingScope, scopeId: string | null): Promise<SettingRow[]> {
    let query = supabaseAdmin.from("settings").select(COLUMNS).eq("scope", scope);
    query = scopeId ? query.eq("scope_id", scopeId) : query.is("scope_id", null);
    const { data, error } = await query.order("key");
    if (error) throw dbError("list settings", error);
    return (data ?? []) as SettingRow[];
  },

  async applicable(projectId: string | null, userId: string | null): Promise<SettingRow[]> {
    const filters = ["scope.eq.global"];
    if (projectId) filters.push(`and(scope.eq.project,scope_id.eq.${orValue(projectId, "projectId")})`);
    if (userId) filters.push(`and(scope.eq.user,scope_id.eq.${orValue(userId, "userId")})`);
    const { data, error } = await supabaseAdmin.from("settings").select(COLUMNS).or(filters.join(","));
    if (error) throw dbError("read settings", error);
    return (data ?? []) as SettingRow[];
  },

  async find(key: string, target: SettingTarget): Promise<SettingRow | null> {
    let query = supabaseAdmin.from("settings").select(COLUMNS).eq("scope", target.scope).eq("key", key);
    query = target.scopeId ? query.eq("scope_id", target.scopeId) : query.is("scope_id", null);
    const { data, error } = await query.maybeSingle();
    if (error) throw dbError("read setting", error);
    return (data as SettingRow | null) ?? null;
  },

  async upsert(key: string, target: SettingTarget, value: SettingValue, updatedBy: string): Promise<void> {
    let query = supabaseAdmin.from("settings").update({ value, updated_by: updatedBy }).eq("scope", target.scope).eq("key", key);
    query = target.scopeId ? query.eq("scope_id", target.scopeId) : query.is("scope_id", null);
    const { data, error } = await query.select("key");
    if (error) throw dbError("update setting", error);
    if (data?.length) return;
    const { error: insertError } = await supabaseAdmin.from("settings").insert({ scope: target.scope, scope_id: target.scopeId, key, value, updated_by: updatedBy });
    if (insertError) throw dbError("insert setting", insertError);
  },

  async remove(key: string, target: SettingTarget): Promise<void> {
    let query = supabaseAdmin.from("settings").delete().eq("scope", target.scope).eq("key", key);
    query = target.scopeId ? query.eq("scope_id", target.scopeId) : query.is("scope_id", null);
    const { error } = await query;
    if (error) throw dbError("delete setting", error);
  },
};
