import { auraApiHeaders, auraApiUrl } from '../lib/aura-api';
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

// A caller bound to one run; readOnly answers as plan mode, worktree targets a parallel part's worktree.
export function bridgeCaller(runId: string, fetchImpl: typeof fetch = fetch, options: { readOnly?: () => Promise<boolean>; worktree?: string } = {}): BridgeCaller {
  return {
    async call(op, args, timeoutMs) {
      const readOnly = (await options.readOnly?.().catch(() => false)) === true;
      let res: Response;
      try {
        res = await fetchImpl(`${auraApiUrl()}/internal/bridge/calls`, {
          method: 'POST',
          headers: auraApiHeaders(),
          body: JSON.stringify({ runId, op, args, ...(timeoutMs ? { timeoutMs } : {}), ...(readOnly ? { readOnly: true } : {}), ...(options.worktree ? { worktree: options.worktree } : {}) }),
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
