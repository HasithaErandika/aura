import { env } from "../../config/env.js";
import type { AuthedUser } from "../../lib/auth/user.js";
import { badRequest, notFound, validationFailed } from "../../lib/http/errors.js";
import { assertProjectExists, currentProjectId } from "../projects/index.js";
import { settingDefinition, type SettingDefinition, type SettingScope, type SettingValue } from "./settings.registry.js";
import { settingsRepository } from "./settings.repository.js";
import { authorizeTarget, capFor, resolveSettings, runtimeSettings, type EffectiveSettings, type SettingTarget } from "./settings.resolve.js";
import { toSettingView, type SettingView } from "./settings.types.js";

export interface TurnSettings {
  effective: EffectiveSettings;
  runtime: Record<string, SettingValue>;
  approvalSlaHours: number;
  turnTimeoutMs: number;
}

export async function listSettings(scope: SettingScope, scopeId: string | null): Promise<SettingView[]> {
  return (await settingsRepository.list(scope, scopeId)).map(toSettingView);
}

export async function effectiveSettings(projectId: string | null, userId: string | null): Promise<EffectiveSettings> {
  const rows = await settingsRepository.applicable(projectId, userId);
  return resolveSettings(
    rows.map((row) => ({ scope: row.scope, scopeId: row.scope_id, key: row.key, value: row.value })),
    { projectId, userId },
  );
}

function numberOf(effective: EffectiveSettings, key: string, fallback: number): number {
  const value = effective[key]?.value;
  return typeof value === "number" ? value : fallback;
}

// A settings outage must not stop agent work, so read errors fall back to .env values.
export async function turnSettings(userId: string): Promise<TurnSettings> {
  const effective = await currentProjectId()
    .then((projectId) => effectiveSettings(projectId, userId))
    .catch(() => resolveSettings([], { projectId: null, userId: null }));
  return {
    effective,
    runtime: runtimeSettings(effective),
    approvalSlaHours: numberOf(effective, "governance.approvalSlaHours", env.approvalSlaHours),
    turnTimeoutMs: numberOf(effective, "limits.turnTimeoutMinutes", env.runTurnTimeoutMs / 60_000) * 60_000,
  };
}

function lookupDefinition(key: string): SettingDefinition {
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

  if (scoped.scope === "project" && scoped.scopeId) await assertProjectExists(scoped.scopeId);
  if (scoped.scope === "user" && def.cap) {
    const limit = capFor(def, await effectiveSettings(await currentProjectId(), null));
    if (limit !== null && typeof value === "number" && value > limit) throw badRequest(`Your ${def.label.toLowerCase()} can't exceed the project limit (${limit})`, { limit });
  }

  const before = (await settingsRepository.find(key, scoped))?.value ?? null;
  await settingsRepository.upsert(key, scoped, value, user.id);
  return { before, after: value, target: scoped };
}

export async function resetSetting(key: string, target: SettingTarget, user: AuthedUser): Promise<{ before: unknown; target: SettingTarget }> {
  const scoped = authorizeTarget(lookupDefinition(key), target, user);
  const before = (await settingsRepository.find(key, scoped))?.value ?? null;
  await settingsRepository.remove(key, scoped);
  return { before, target: scoped };
}
