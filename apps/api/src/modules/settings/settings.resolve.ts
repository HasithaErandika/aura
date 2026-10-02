import { badRequest, forbidden } from "../../lib/http/errors.js";
import type { AuthedUser } from "../../lib/auth/user.js";
import { canChangeSharedSettings } from "../policy/index.js";
import { SETTING_DEFINITIONS, type SettingDefinition, type SettingScope, type SettingValue } from "./settings.registry.js";

// Most specific wins: user > project > global > fallback; capped user values are clamped.

export interface StoredSetting {
  scope: SettingScope;
  scopeId: string | null;
  key: string;
  value: unknown;
}

type SettingSource = SettingScope | "default";

interface EffectiveSetting {
  value: SettingValue;
  source: SettingSource;
}

export type EffectiveSettings = Record<string, EffectiveSetting>;

// A stored value that fails its current schema is ignored, never applied.
function valid(def: SettingDefinition, value: unknown): SettingValue | undefined {
  const parsed = def.schema.safeParse(value);
  return parsed.success ? (parsed.data as SettingValue) : undefined;
}

function pick(def: SettingDefinition, rows: StoredSetting[], scope: SettingScope, scopeId: string | null): SettingValue | undefined {
  if (!def.scopes.includes(scope)) return undefined;
  const row = rows.find((r) => r.key === def.key && r.scope === scope && (scope === "global" || r.scopeId === scopeId));
  return row ? valid(def, row.value) : undefined;
}

export function resolveSettings(rows: StoredSetting[], target: { projectId: string | null; userId: string | null }): EffectiveSettings {
  const result: EffectiveSettings = {};
  for (const def of SETTING_DEFINITIONS) {
    const global = pick(def, rows, "global", null);
    const project = target.projectId ? pick(def, rows, "project", target.projectId) : undefined;
    const user = target.userId ? pick(def, rows, "user", target.userId) : undefined;

    let shared: EffectiveSetting = { value: def.fallback(), source: "default" };
    if (global !== undefined) shared = { value: global, source: "global" };
    if (project !== undefined) shared = { value: project, source: "project" };

    if (user === undefined) {
      result[def.key] = shared;
    } else if (def.cap && typeof user === "number" && typeof shared.value === "number" && user > shared.value) {
      result[def.key] = shared;
    } else {
      result[def.key] = { value: user, source: "user" };
    }
  }
  return result;
}

// Only runtime-owned values set somewhere, so the runtime's own .env still supplies defaults.
export function runtimeSettings(effective: EffectiveSettings): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const def of SETTING_DEFINITIONS) {
    const e = effective[def.key];
    if (def.owner === "runtime" && e && e.source !== "default") out[def.key] = e.value;
  }
  return out;
}

export function capFor(def: SettingDefinition, effectiveWithoutUser: EffectiveSettings): number | null {
  if (!def.cap) return null;
  const value = effectiveWithoutUser[def.key]?.value;
  return typeof value === "number" ? value : null;
}

export interface SettingTarget {
  scope: SettingScope;
  scopeId: string | null;
}

// Admins change shared values; every user changes only their own preferences.
export function authorizeTarget(def: SettingDefinition, target: SettingTarget, user: AuthedUser): SettingTarget {
  if (!def.scopes.includes(target.scope)) throw badRequest(`${def.key} can't be set at ${target.scope} scope`, { scopes: def.scopes });
  if (target.scope === "user") return { scope: "user", scopeId: user.id };
  if (!canChangeSharedSettings(user.role)) throw forbidden("Only an admin can change shared settings");
  if (target.scope === "global") return { scope: "global", scopeId: null };
  if (!target.scopeId) throw badRequest("A project setting needs a project id");
  return target;
}
