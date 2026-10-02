import { describe, expect, it } from 'vitest';
import { parseDashboardSettings, settingsFrom, SETTINGS_CONTEXT_KEY } from './settings';

describe('parseDashboardSettings', () => {
  it('maps dashboard keys to review rounds and injection policy', () => {
    expect(parseDashboardSettings({ 'vscode.evaluatorRounds': 3, 'governance.injectionPolicy': 'block' })).toEqual({ evaluatorRounds: 3, injectionPolicy: 'block' });
  });

  it('drops out-of-range, wrongly typed and unknown values', () => {
    expect(parseDashboardSettings({ 'vscode.evaluatorRounds': 9, 'governance.injectionPolicy': 'off', 'council.mode': 'lean', 'other.key': 1 })).toEqual({});
  });

  it('returns empty settings for missing or malformed context', () => {
    expect(parseDashboardSettings(undefined)).toEqual({});
    expect(parseDashboardSettings('vscode.evaluatorRounds=2')).toEqual({});
    expect(settingsFrom({ get: (k) => (k === SETTINGS_CONTEXT_KEY ? { 'vscode.evaluatorRounds': 2 } : undefined) })).toEqual({ evaluatorRounds: 2 });
  });
});
