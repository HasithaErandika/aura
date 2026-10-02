import { createHash, timingSafeEqual } from 'node:crypto';
import type { Middleware } from '@mastra/core/server';
import { auraMode } from '../config/aura-mode';

// Only apps/api may call this runtime. The API has already authenticated the user, checked the
// policy and written the audit record; without this check anyone who can reach the port could run
// an agent, resume a suspended gate or write workspace files directly, skipping all of that.
//
// MASTRA_RUNTIME_TOKEN (the same value in apps/api/.env) is required on every request when set.
// Leaving it unset is allowed only in local mode, so Mastra Studio keeps working on a developer's
// machine; AURA_MODE=server refuses to start without it.

export const MIN_RUNTIME_TOKEN_LENGTH = 32;

export function runtimeTokenFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.MASTRA_RUNTIME_TOKEN?.trim() || null;
  const mode = auraMode(env);
  if (token && token.length < MIN_RUNTIME_TOKEN_LENGTH) {
    throw new Error(`MASTRA_RUNTIME_TOKEN must be at least ${MIN_RUNTIME_TOKEN_LENGTH} characters (e.g. \`openssl rand -hex 32\`)`);
  }
  if (!token && mode === 'server') {
    throw new Error('AURA_MODE=server requires MASTRA_RUNTIME_TOKEN (same value in apps/api/.env)');
  }
  return token;
}

// Compares hashes so timingSafeEqual gets equal lengths and leaks nothing about the token's length.
export function isAuthorized(header: string | undefined, token: string): boolean {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  if (!match) return false;
  const given = createHash('sha256').update(match[1]).digest();
  const expected = createHash('sha256').update(token).digest();
  return timingSafeEqual(given, expected);
}

export function runtimeAuth(token: string | null): Middleware[] {
  if (!token) {
    console.warn('[aura-runtime] MASTRA_RUNTIME_TOKEN is not set: this runtime accepts unauthenticated requests. Fine for local mode on loopback only.');
    return [];
  }
  return [
    async (c, next) => {
      // CORS preflights carry no Authorization header; they can't reach a handler anyway.
      if (c.req.method === 'OPTIONS') return next();
      if (!isAuthorized(c.req.header('authorization'), token)) return c.json({ error: 'Unauthorized' }, 401);
      await next();
    },
  ];
}
