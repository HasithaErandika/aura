import { councilModeSettings, inCouncilBounds, type CouncilModeSetting, type CouncilSettings } from '../contracts/council';
import type { InjectionPolicy } from '../gateway/untrusted';

// Dashboard settings for this turn (docs/plans/aura-automation-durability.md Part A). apps/api
// sends only the values set in its Settings pages, as requestContext auraSettings (apps/api
// modules/settings); everything not sent falls back to this runtime's .env and code defaults.
// Trusted only because only the API can call the runtime (server/runtime-auth.ts), and still
// re-checked here against the same bounds as the .env values: an out-of-range value is ignored.

export const SETTINGS_CONTEXT_KEY = 'auraSettings';

export interface DashboardSettings {
  councilMode?: CouncilModeSetting;
  council: Partial<CouncilSettings>;
  injectionPolicy?: InjectionPolicy;
  // VS Code Task: coder → Evaluator rounds before Gate 5 (tools/task-tools.ts).
  evaluatorRounds?: number;
}

interface RequestContextLike {
  get: (key: string) => unknown;
}

const COUNCIL_KEYS: Record<string, keyof CouncilSettings> = {
  'council.planRounds': 'planRounds',
  'council.maxRounds': 'maxRounds',
  'council.implementerSteps': 'implementerSteps',
  'council.fixSteps': 'fixSteps',
  'council.tokenBudget': 'tokenBudget',
};

export function parseDashboardSettings(raw: unknown): DashboardSettings {
  const result: DashboardSettings = { council: {} };
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const councilKey = COUNCIL_KEYS[key];
    if (councilKey) {
      if (inCouncilBounds(councilKey, value)) result.council[councilKey] = value;
    } else if (key === 'council.mode') {
      if (typeof value === 'string' && (councilModeSettings as readonly string[]).includes(value)) result.councilMode = value as CouncilModeSetting;
    } else if (key === 'vscode.evaluatorRounds') {
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
