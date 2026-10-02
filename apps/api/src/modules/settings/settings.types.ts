import type { SettingScope } from "./settings.registry.js";

export interface SettingRow {
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

export function toSettingView(row: SettingRow): SettingView {
  return { scope: row.scope, scopeId: row.scope_id, key: row.key, value: row.value, updatedBy: row.updated_by, updatedAt: row.updated_at };
}
