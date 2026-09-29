import { describe, expect, it } from 'vitest';
import { isAuthorized, runtimeTokenFromEnv } from './runtime-auth';

const TOKEN = 'a'.repeat(64);

describe('runtimeTokenFromEnv', () => {
  it('allows no token in local mode (the default)', () => {
    expect(runtimeTokenFromEnv({})).toBeNull();
    expect(runtimeTokenFromEnv({ AURA_MODE: 'local' })).toBeNull();
  });

  it('refuses server mode without a token', () => {
    expect(() => runtimeTokenFromEnv({ AURA_MODE: 'server' })).toThrow(/requires MASTRA_RUNTIME_TOKEN/);
  });

  it('refuses a short token and an unknown mode', () => {
    expect(() => runtimeTokenFromEnv({ MASTRA_RUNTIME_TOKEN: 'short' })).toThrow(/at least 32/);
    expect(() => runtimeTokenFromEnv({ AURA_MODE: 'prod', MASTRA_RUNTIME_TOKEN: TOKEN })).toThrow(/AURA_MODE/);
  });

  it('returns the trimmed token', () => {
    expect(runtimeTokenFromEnv({ AURA_MODE: 'server', MASTRA_RUNTIME_TOKEN: ` ${TOKEN} ` })).toBe(TOKEN);
  });
});

describe('isAuthorized', () => {
  it('accepts only the exact bearer token', () => {
    expect(isAuthorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(isAuthorized(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(isAuthorized(`Bearer ${'b'.repeat(64)}`, TOKEN)).toBe(false);
    expect(isAuthorized(TOKEN, TOKEN)).toBe(false);
    expect(isAuthorized('Bearer ', TOKEN)).toBe(false);
    expect(isAuthorized(undefined, TOKEN)).toBe(false);
  });
});
