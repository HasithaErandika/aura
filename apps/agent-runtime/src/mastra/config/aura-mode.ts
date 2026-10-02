// AURA_MODE=local (default, one developer) or server (shared); server mode refuses unsafe settings at startup.

export type AuraMode = 'local' | 'server';

export function auraMode(env: NodeJS.ProcessEnv = process.env): AuraMode {
  const mode = env.AURA_MODE?.trim() || 'local';
  if (mode !== 'local' && mode !== 'server') throw new Error(`AURA_MODE must be "local" or "server", got "${mode}"`);
  return mode;
}

// Every reason this environment can't run as a shared server; empty in local mode.
export function serverModeProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (auraMode(env) !== 'server') return [];
  const problems: string[] = [];
  if (!env.MASTRA_RUNTIME_TOKEN?.trim()) {
    problems.push('MASTRA_RUNTIME_TOKEN is required (same value in apps/api/.env)');
  }
  if (!env.DATABASE_URL?.trim()) {
    problems.push('DATABASE_URL is required (Postgres for agent memory, drafts and ledgers)');
  }
  return problems;
}

export function assertServerModeSafe(env: NodeJS.ProcessEnv = process.env): void {
  const problems = serverModeProblems(env);
  if (problems.length) throw new Error(`AURA_MODE=server refused:\n  - ${problems.join('\n  - ')}`);
}
