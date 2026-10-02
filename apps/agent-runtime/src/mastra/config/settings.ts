import type { InjectionPolicy } from '../gateway/untrusted';

// Dashboard settings apps/api sends with each turn; out-of-range values are ignored.
export const SETTINGS_CONTEXT_KEY = 'auraSettings';

export interface DashboardSettings {
  injectionPolicy?: InjectionPolicy;
  // Coder ↔ Evaluator rounds before Gate 5.
  evaluatorRounds?: number;
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
    }
  }
  return result;
}

export function settingsFrom(requestContext: RequestContextLike | undefined): DashboardSettings {
  return parseDashboardSettings(requestContext?.get(SETTINGS_CONTEXT_KEY));
}
