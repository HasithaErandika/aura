// AURA_MODE=local (default): one developer's machine, bound to loopback. AURA_MODE=server: a
// shared deployment, where the settings that are only safe for a single user on loopback are
// refused at startup (docs/adr/0002-team-scale-deployment.md, docs/security/threat-model.md §4).

export type AuraMode = 'local' | 'server';

export function auraMode(env: NodeJS.ProcessEnv = process.env): AuraMode {
  const mode = env.AURA_MODE?.trim() || 'local';
  if (mode !== 'local' && mode !== 'server') throw new Error(`AURA_MODE must be "local" or "server", got "${mode}"`);
  return mode;
}

// Every reason this environment can't run as a shared server, all at once so one restart fixes
// them. Empty in local mode.
export function serverModeProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (auraMode(env) !== 'server') return [];
  const problems: string[] = [];
  if (!env.MASTRA_RUNTIME_TOKEN?.trim()) {
    problems.push('MASTRA_RUNTIME_TOKEN is required (same value in apps/api/.env)');
  }
  // Host checks run the project's own scripts, which the agent can edit, on this machine.
  if (env.SANDBOX_MODE !== 'docker') {
    problems.push('SANDBOX_MODE must be "docker" (host checks run agent-edited scripts on the server)');
  }
  // A full shell on a shared machine reaches every other developer's work.
  if (env.TERMINAL_MODE === 'full') {
    problems.push('TERMINAL_MODE=full is not allowed; use "restricted" or "off"');
  }
  return problems;
}

export function assertServerModeSafe(env: NodeJS.ProcessEnv = process.env): void {
  const problems = serverModeProblems(env);
  if (problems.length) throw new Error(`AURA_MODE=server refused:\n  - ${problems.join('\n  - ')}`);
}
