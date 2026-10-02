import { describe, expect, it } from 'vitest';
import { assertServerModeSafe, auraMode, serverModeProblems } from './aura-mode';

const SAFE_SERVER = { AURA_MODE: 'server', MASTRA_RUNTIME_TOKEN: 'a'.repeat(64), DATABASE_URL: 'postgresql://aura@db/aura' };

describe('auraMode', () => {
  it('defaults to local and rejects unknown values', () => {
    expect(auraMode({})).toBe('local');
    expect(auraMode({ AURA_MODE: 'server' })).toBe('server');
    expect(() => auraMode({ AURA_MODE: 'prod' })).toThrow(/AURA_MODE/);
  });
});

describe('serverModeProblems', () => {
  it('allows anything in local mode', () => {
    expect(serverModeProblems({})).toEqual([]);
  });

  it('accepts a safe server configuration', () => {
    expect(serverModeProblems(SAFE_SERVER)).toEqual([]);
    expect(() => assertServerModeSafe(SAFE_SERVER)).not.toThrow();
  });

  it('reports every unsafe setting at once', () => {
    const problems = serverModeProblems({ AURA_MODE: 'server' });
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toMatch(/MASTRA_RUNTIME_TOKEN/);
    expect(problems.join('\n')).toMatch(/DATABASE_URL/);
    expect(() => assertServerModeSafe({ AURA_MODE: 'server' })).toThrow(/AURA_MODE=server refused/);
  });
});
