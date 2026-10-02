import { describe, expect, it } from 'vitest';
import { assertServerModeSafe, auraMode, serverModeProblems } from './aura-mode';

const SAFE_SERVER = { AURA_MODE: 'server', MASTRA_RUNTIME_TOKEN: 'a'.repeat(64), DATABASE_URL: 'postgresql://aura@db/aura', SANDBOX_MODE: 'docker', TERMINAL_MODE: 'restricted' };

describe('auraMode', () => {
  it('defaults to local and rejects unknown values', () => {
    expect(auraMode({})).toBe('local');
    expect(auraMode({ AURA_MODE: 'server' })).toBe('server');
    expect(() => auraMode({ AURA_MODE: 'prod' })).toThrow(/AURA_MODE/);
  });
});

describe('serverModeProblems', () => {
  it('allows anything in local mode', () => {
    expect(serverModeProblems({ TERMINAL_MODE: 'full', SANDBOX_MODE: 'host' })).toEqual([]);
  });

  it('accepts a safe server configuration', () => {
    expect(serverModeProblems(SAFE_SERVER)).toEqual([]);
    expect(serverModeProblems({ ...SAFE_SERVER, TERMINAL_MODE: undefined })).toEqual([]);
    expect(() => assertServerModeSafe(SAFE_SERVER)).not.toThrow();
  });

  it('reports every unsafe setting at once', () => {
    const problems = serverModeProblems({ AURA_MODE: 'server', TERMINAL_MODE: 'full' });
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toMatch(/MASTRA_RUNTIME_TOKEN/);
    expect(problems.join('\n')).toMatch(/DATABASE_URL/);
    expect(problems.join('\n')).toMatch(/SANDBOX_MODE/);
    expect(problems.join('\n')).toMatch(/TERMINAL_MODE=full/);
    expect(() => assertServerModeSafe({ AURA_MODE: 'server' })).toThrow(/AURA_MODE=server refused/);
  });
});
