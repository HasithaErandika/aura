import { describe, expect, it } from 'vitest';
import { parseDashboardSettings, settingsFrom, SETTINGS_CONTEXT_KEY } from './settings';

describe('parseDashboardSettings', () => {
  it('maps dashboard keys to council, mode and injection settings', () => {
    expect(parseDashboardSettings({ 'council.mode': 'lean', 'council.maxRounds': 3, 'council.tokenBudget': 200_000, 'governance.injectionPolicy': 'block' })).toEqual({
      councilMode: 'lean',
      council: { maxRounds: 3, tokenBudget: 200_000 },
      injectionPolicy: 'block',
    });
  });

  it('drops out-of-range, wrongly typed and unknown values', () => {
    expect(parseDashboardSettings({ 'council.maxRounds': 50, 'council.fixSteps': '8', 'council.mode': 'turbo', 'governance.injectionPolicy': 'off', 'other.key': 1 })).toEqual({ council: {} });
  });

  it('returns empty settings for missing or malformed context', () => {
    expect(parseDashboardSettings(undefined)).toEqual({ council: {} });
    expect(parseDashboardSettings('council.mode=lean')).toEqual({ council: {} });
    expect(settingsFrom({ get: (k) => (k === SETTINGS_CONTEXT_KEY ? { 'council.planRounds': 0 } : undefined) })).toEqual({ council: { planRounds: 0 } });
  });
});
