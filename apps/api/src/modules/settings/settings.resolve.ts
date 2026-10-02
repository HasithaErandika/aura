import { badRequest, forbidden } from "../../lib/http/errors.js";
import type { AuthedUser } from "../../middleware/auth.js";
import { SETTING_DEFINITIONS, type SettingDefinition, type SettingScope, type SettingValue } from "./settings.registry.js";

// Pure resolution of stored settings into the values that apply to one user in one project.
// The most specific scope wins: user > project > global > fallback. A "cap" setting (a budget)
// never lets a user value exceed the project/global value - it is clamped, so lowering a project
// limit later also lowers every personal value above it.

export interface StoredSetting {
  scope: SettingScope;
  scopeId: string | null;
  key: string;
  value: unknown;
}

export type SettingSource = SettingScope | "default";

export interface EffectiveSetting {
  value: SettingValue;
  source: SettingSource;
}

export type EffectiveSettings = Record<string, EffectiveSetting>;

// A stored value that no longer passes its schema (bounds tightened in code) is ignored, never
// applied.
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

// What the runtime receives: only runtime-owned values that were set somewhere (not defaults), so
// its own .env keeps working for everything the dashboard doesn't set.
export function runtimeSettings(effective: EffectiveSettings): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const def of SETTING_DEFINITIONS) {
    const e = effective[def.key];
    if (def.owner === "runtime" && e && e.source !== "default") out[def.key] = e.value;
  }
  return out;
}

// The limit a user value is checked against when it is saved: the value that applies without it.
export function capFor(def: SettingDefinition, effectiveWithoutUser: EffectiveSettings): number | null {
  if (!def.cap) return null;
  const value = effectiveWithoutUser[def.key]?.value;
  return typeof value === "number" ? value : null;
}

export interface SettingTarget {
  scope: SettingScope;
  scopeId: string | null;
}

// Who may change a setting at a scope: admins for global and project values, every user for their
// own preferences only.
export function authorizeTarget(def: SettingDefinition, target: SettingTarget, user: AuthedUser): SettingTarget {
  if (!def.scopes.includes(target.scope)) throw badRequest(`${def.key} can't be set at ${target.scope} scope`, { scopes: def.scopes });
  if (target.scope === "user") return { scope: "user", scopeId: user.id };
  if (user.role !== "admin") throw forbidden("Only an admin can change shared settings");
  if (target.scope === "global") return { scope: "global", scopeId: null };
  if (!target.scopeId) throw badRequest("A project setting needs a project id");
  return target;
}
