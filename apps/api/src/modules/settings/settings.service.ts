import { supabaseAdmin } from "../../lib/supabase.js";
import { env } from "../../config/env.js";
import { badRequest, notFound, upstreamError, validationFailed } from "../../lib/http/errors.js";
import type { AuthedUser } from "../../middleware/auth.js";
import { settingDefinition, type SettingDefinition, type SettingScope, type SettingValue } from "./settings.registry.js";
import { authorizeTarget, capFor, resolveSettings, runtimeSettings, type EffectiveSettings, type SettingTarget, type StoredSetting } from "./settings.resolve.js";

// Dashboard settings (supabase/migrations/0008_settings.sql). Reads and writes go through the
// service-role client; who may change what is decided here, from the registry.

interface SettingRow {
  scope: SettingScope;
  scope_id: string | null;
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

export interface SettingView {
  scope: SettingScope;
  scopeId: string | null;
  key: string;
  value: unknown;
  updatedBy: string | null;
  updatedAt: string;
}

const COLUMNS = "scope, scope_id, key, value, updated_by, updated_at";

function toView(row: SettingRow): SettingView {
  return { scope: row.scope, scopeId: row.scope_id, key: row.key, value: row.value, updatedBy: row.updated_by, updatedAt: row.updated_at };
}

function toStored(row: SettingRow): StoredSetting {
  return { scope: row.scope, scopeId: row.scope_id, key: row.key, value: row.value };
}

export async function listSettings(scope: SettingScope, scopeId: string | null): Promise<SettingView[]> {
  let query = supabaseAdmin.from("settings").select(COLUMNS).eq("scope", scope);
  query = scopeId ? query.eq("scope_id", scopeId) : query.is("scope_id", null);
  const { data, error } = await query.order("key");
  if (error) throw upstreamError(error.message);
  return ((data ?? []) as SettingRow[]).map(toView);
}

async function rowsFor(projectId: string | null, userId: string | null): Promise<StoredSetting[]> {
  const filters = ["scope.eq.global"];
  if (projectId) filters.push(`and(scope.eq.project,scope_id.eq.${projectId})`);
  if (userId) filters.push(`and(scope.eq.user,scope_id.eq.${userId})`);
  const { data, error } = await supabaseAdmin.from("settings").select(COLUMNS).or(filters.join(","));
  if (error) throw upstreamError(error.message);
  return ((data ?? []) as SettingRow[]).map(toStored);
}

export async function effectiveSettings(projectId: string | null, userId: string | null): Promise<EffectiveSettings> {
  return resolveSettings(await rowsFor(projectId, userId), { projectId, userId });
}

// Until runs carry a project (plan Part D), a turn belongs to the project registered for this
// deployment's Jira project (JIRA_PROJECT_KEY). Cached briefly; null when none is registered.
let projectCache: { at: number; id: string | null } | null = null;
const PROJECT_CACHE_MS = 60_000;

export async function currentProjectId(): Promise<string | null> {
  if (!env.jiraProjectKey) return null;
  if (projectCache && Date.now() - projectCache.at < PROJECT_CACHE_MS) return projectCache.id;
  const { data, error } = await supabaseAdmin.from("projects").select("id").eq("jira_project_key", env.jiraProjectKey).maybeSingle();
  if (error) throw upstreamError(error.message);
  projectCache = { at: Date.now(), id: (data as { id: string } | null)?.id ?? null };
  return projectCache.id;
}

export interface TurnSettings {
  effective: EffectiveSettings;
  // Sent to the runtime as requestContext auraSettings.
  runtime: Record<string, SettingValue>;
  approvalSlaHours: number;
  turnTimeoutMs: number;
}

function numberOf(effective: EffectiveSettings, key: string, fallback: number): number {
  const value = effective[key]?.value;
  return typeof value === "number" ? value : fallback;
}

// The settings that apply to one agent turn. A settings outage must not stop agent work, so on a
// read error this falls back to .env values (and logs nothing secret).
export async function turnSettings(userId: string): Promise<TurnSettings> {
  let effective: EffectiveSettings;
  try {
    effective = await effectiveSettings(await currentProjectId(), userId);
  } catch {
    effective = resolveSettings([], { projectId: null, userId: null });
  }
  return {
    effective,
    runtime: runtimeSettings(effective),
    approvalSlaHours: numberOf(effective, "governance.approvalSlaHours", env.approvalSlaHours),
    turnTimeoutMs: numberOf(effective, "limits.turnTimeoutMinutes", env.runTurnTimeoutMs / 60_000) * 60_000,
  };
}

async function ensureProject(id: string): Promise<void> {
  const { data, error } = await supabaseAdmin.from("projects").select("id").eq("id", id).maybeSingle();
  if (error) throw upstreamError(error.message);
  if (!data) throw notFound("Project");
}

async function currentValue(key: string, target: SettingTarget): Promise<unknown> {
  return (await listSettings(target.scope, target.scopeId)).find((s) => s.key === key)?.value ?? null;
}

export function lookupDefinition(key: string): SettingDefinition {
  const def = settingDefinition(key);
  if (!def) throw notFound("Setting");
  return def;
}

export async function setSetting(key: string, target: SettingTarget, rawValue: unknown, user: AuthedUser): Promise<{ before: unknown; after: SettingValue; target: SettingTarget }> {
  const def = lookupDefinition(key);
  const scoped = authorizeTarget(def, target, user);
  const parsed = def.schema.safeParse(rawValue);
  if (!parsed.success) throw validationFailed({ value: parsed.error.flatten().formErrors });
  const value = parsed.data as SettingValue;

  if (scoped.scope === "project" && scoped.scopeId) await ensureProject(scoped.scopeId);
  if (scoped.scope === "user" && def.cap) {
    const limit = capFor(def, await effectiveSettings(await currentProjectId(), null));
    if (limit !== null && typeof value === "number" && value > limit) throw badRequest(`Your ${def.label.toLowerCase()} can't exceed the project limit (${limit})`, { limit });
  }

  const before = await currentValue(key, scoped);
  let query = supabaseAdmin.from("settings").update({ value, updated_by: user.id }).eq("scope", scoped.scope).eq("key", key);
  query = scoped.scopeId ? query.eq("scope_id", scoped.scopeId) : query.is("scope_id", null);
  const { data: updated, error: updateError } = await query.select("key");
  if (updateError) throw upstreamError(updateError.message);
  if (!updated || updated.length === 0) {
    const { error } = await supabaseAdmin.from("settings").insert({ scope: scoped.scope, scope_id: scoped.scopeId, key, value, updated_by: user.id });
    if (error) throw upstreamError(error.message);
  }
  return { before, after: value, target: scoped };
}

export async function resetSetting(key: string, target: SettingTarget, user: AuthedUser): Promise<{ before: unknown; target: SettingTarget }> {
  const def = lookupDefinition(key);
  const scoped = authorizeTarget(def, target, user);
  const before = await currentValue(key, scoped);
  let query = supabaseAdmin.from("settings").delete().eq("scope", scoped.scope).eq("key", key);
  query = scoped.scopeId ? query.eq("scope_id", scoped.scopeId) : query.is("scope_id", null);
  const { error } = await query;
  if (error) throw upstreamError(error.message);
  return { before, target: scoped };
}
