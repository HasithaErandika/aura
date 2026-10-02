import type { BridgeArgs, BridgeError, BridgeOp, BridgeResultValue } from '@aura/bridge';

// Sends one workspace operation (read a file, run a command) to the developer's VS Code, through
// apps/api (POST /internal/bridge/calls), and waits for the answer (ADR-4). apps/api routes it to
// the extension of the user who owns the run. Only types come from @aura/bridge, so the Mastra
// bundler never has to bundle a workspace package.

export class BridgeCallError extends Error {
  constructor(
    readonly code: BridgeError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'BridgeCallError';
  }
}

export interface BridgeCaller {
  call<O extends BridgeOp>(op: O, args: BridgeArgs<O>, timeoutMs?: number): Promise<BridgeResultValue<O>>;
}

type Outcome = { ok: true; value: unknown } | { ok: false; error: BridgeError };

function apiUrl(): string {
  return (process.env.AURA_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
}

// A caller bound to one AURA run, so apps/api knows whose VS Code to use.
export function bridgeCaller(runId: string, fetchImpl: typeof fetch = fetch): BridgeCaller {
  return {
    async call(op, args, timeoutMs) {
      const token = process.env.MASTRA_RUNTIME_TOKEN?.trim();
      let res: Response;
      try {
        res = await fetchImpl(`${apiUrl()}/internal/bridge/calls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ runId, op, args, ...(timeoutMs ? { timeoutMs } : {}) }),
        });
      } catch (error) {
        throw new BridgeCallError('not_connected', `AURA API unreachable from the runtime (${error instanceof Error ? error.message : String(error)})`);
      }
      if (!res.ok) throw new BridgeCallError('failed', `AURA API refused the bridge call (${res.status})`);
      const outcome = (await res.json()) as Outcome;
      if (!outcome.ok) throw new BridgeCallError(outcome.error.code, outcome.error.message);
      return outcome.value as never;
    },
  };
}
