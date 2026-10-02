import { api } from "../api/client.ts";


export type SettingScope = "global" | "project" | "user";
export type SettingGroup = "agents" | "governance" | "limits";
export type SettingValue = string | number | boolean;
export type SettingSource = SettingScope | "default";

export interface SettingDefinition {
  key: string;
  group: SettingGroup;
  label: string;
  description: string;
  owner: "api" | "runtime";
  scopes: SettingScope[];
  input: { type: "enum"; options: string[] } | { type: "integer"; min: number; max: number; unit?: string };
  cap: boolean;
  default: SettingValue;
}

export interface StoredSetting {
  scope: SettingScope;
  scopeId: string | null;
  key: string;
  value: SettingValue;
  updatedBy: string | null;
  updatedAt: string;
}

export interface EffectiveSetting {
  value: SettingValue;
  source: SettingSource;
}

export const settingsApi = {
  definitions: () => api.get<{ definitions: SettingDefinition[] }>("/settings/definitions").then((r) => r.definitions),
  list: (scope: "global" | "project", scopeId?: string) =>
    api.get<{ settings: StoredSetting[] }>(`/settings?scope=${scope}${scopeId ? `&scopeId=${scopeId}` : ""}`).then((r) => r.settings),
  mine: () => api.get<{ settings: StoredSetting[] }>("/settings/mine").then((r) => r.settings),
  effective: (options: { projectId?: string; includeMine?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (options.projectId) params.set("projectId", options.projectId);
    if (options.includeMine === false) params.set("mine", "false");
    const query = params.toString();
    return api.get<{ projectId: string | null; settings: Record<string, EffectiveSetting> }>(`/settings/effective${query ? `?${query}` : ""}`);
  },
  set: (key: string, scope: SettingScope, scopeId: string | null, value: SettingValue) => api.put<unknown>(`/settings/${key}`, { scope, scopeId, value }),
  reset: (key: string, scope: SettingScope, scopeId: string | null) =>
    api.delete<void>(`/settings/${key}?scope=${scope}${scopeId ? `&scopeId=${scopeId}` : ""}`),
};

export const GROUP_LABELS: Record<SettingGroup, { title: string; description: string }> = {
  agents: { title: "Agents", description: "Review rounds for the VS Code coders." },
  governance: { title: "Governance", description: "How long gates wait and how prompt injection is handled." },
  limits: { title: "Limits", description: "Time limits for agent work." },
};
