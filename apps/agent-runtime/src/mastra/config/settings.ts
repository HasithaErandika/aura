import type { InjectionPolicy } from '../gateway/untrusted';

// Dashboard settings apps/api sends with each turn; out-of-range values are ignored.
export const SETTINGS_CONTEXT_KEY = 'auraSettings';

export type DataClass = 'public' | 'internal' | 'confidential';
export const DATA_CLASSES: readonly DataClass[] = ['public', 'internal', 'confidential'];

export interface DashboardSettings {
  injectionPolicy?: InjectionPolicy;
  // Coder ↔ Evaluator rounds before Gate 5.
  evaluatorRounds?: number;
  // Which model providers may see this project's data (config/model-policy.ts).
  dataClass?: DataClass;
}

interface RequestContextLike {
  get: (key: string) => unknown;
}

export function parseDashboardSettings(raw: unknown): DashboardSettings {
  const result: DashboardSettings = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === 'vscode.evaluatorRounds') {
      if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5) result.evaluatorRounds = value;
    } else if (key === 'governance.injectionPolicy') {
      if (value === 'warn' || value === 'block') result.injectionPolicy = value;
    } else if (key === 'governance.dataClass') {
      if (DATA_CLASSES.includes(value as DataClass)) result.dataClass = value as DataClass;
    }
  }
  return result;
}

export function settingsFrom(requestContext: RequestContextLike | undefined): DashboardSettings {
  return parseDashboardSettings(requestContext?.get(SETTINGS_CONTEXT_KEY));
}
