import { createHash } from 'node:crypto';

// Loop guards for the Orchestrator's tool calls (docs/ARCHITECTURE.md §5 "Loop guards beyond the
// Tester Agent"). Agents already have per-call step caps (maxSteps) and the Council and Tester
// loops are bounded; what's left is the Orchestrator going round in circles across calls:
//   - the same call with the same arguments, again and again
//   - the same tool failing over and over on one thread
//   - a draft revised without end
// A tripped guard refuses the call with HALTED_LOOP_GUARD, which the Orchestrator reports and
// stops on (its rule for ok=false); a human decides what happens next. In memory per process:
// a restart clears the counters, which only ever makes the guard more lenient.

export interface LoopGuardLimits {
  identicalCalls: number; // the Nth identical call inside the window is refused
  consecutiveFailures: number; // after N failures in a row, the tool is paused on that thread
  revisions: number; // a draft at this version can't be revised again
  windowMs: number;
}

export function limitsFromEnv(env: NodeJS.ProcessEnv = process.env): LoopGuardLimits {
  const int = (name: string, fallback: number, min: number, max: number) => {
    const n = Number(env[name]);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    identicalCalls: int('GATEWAY_MAX_IDENTICAL_CALLS', 3, 2, 20),
    consecutiveFailures: int('GATEWAY_MAX_CONSECUTIVE_FAILURES', 3, 1, 20),
    revisions: int('GATEWAY_MAX_REVISIONS', 10, 2, 100),
    windowMs: 15 * 60_000,
  };
}

export const LOOP_GUARD = 'HALTED_LOOP_GUARD';

// Key order doesn't change the signature, so {a,b} and {b,a} are the same call.
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, stable((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function callSignature(tool: string, input: unknown): string {
  return createHash('sha256').update(tool).update('\0').update(JSON.stringify(stable(input))).digest('hex');
}

interface ThreadState {
  calls: Map<string, number[]>; // signature -> timestamps
  failures: Map<string, { count: number; decision: string | null }>; // tool -> streak
  touchedAt: number;
}

export class LoopGuard {
  private readonly threads = new Map<string, ThreadState>();

  constructor(
    private readonly limits: LoopGuardLimits,
    private readonly now: () => number = Date.now,
  ) {}

  private state(threadId: string): ThreadState {
    const t = this.now();
    // Forget idle threads so a long-running process doesn't grow without bound.
    for (const [id, s] of this.threads) if (t - s.touchedAt > this.limits.windowMs) this.threads.delete(id);
    let s = this.threads.get(threadId);
    if (!s) this.threads.set(threadId, (s = { calls: new Map(), failures: new Map(), touchedAt: t }));
    s.touchedAt = t;
    return s;
  }

  // Checks and records a call; returns the refusal reason or null. A new decision resets the failure streak.
  check(threadId: string, tool: string, input: unknown, decisionId: string | null, draftVersion: number | null, revising: boolean): string | null {
    const s = this.state(threadId);
    const t = this.now();

    const streak = s.failures.get(tool);
    if (streak && streak.count >= this.limits.consecutiveFailures && streak.decision === decisionId) {
      return `${LOOP_GUARD}: ${tool} failed ${streak.count} times in a row on this thread. Stopping so a human can look at the errors before it runs again.`;
    }

    if (revising && draftVersion !== null && draftVersion >= this.limits.revisions) {
      return `${LOOP_GUARD}: this draft is already at version ${draftVersion} (limit ${this.limits.revisions}). A human should approve it, reject it, or start a fresh draft.`;
    }

    const signature = callSignature(tool, input);
    const recent = (s.calls.get(signature) ?? []).filter((at) => t - at < this.limits.windowMs);
    if (recent.length + 1 >= this.limits.identicalCalls) {
      s.calls.set(signature, recent);
      return `${LOOP_GUARD}: ${tool} was already called ${recent.length} times with exactly these arguments in the last ${Math.round(this.limits.windowMs / 60_000)} minutes.`;
    }
    recent.push(t);
    s.calls.set(signature, recent);
    return null;
  }

  // Records the outcome of a call that ran.
  record(threadId: string, tool: string, ok: boolean, decisionId: string | null): void {
    const s = this.state(threadId);
    if (ok) {
      s.failures.delete(tool);
      return;
    }
    const streak = s.failures.get(tool);
    s.failures.set(tool, streak && streak.decision === decisionId ? { count: streak.count + 1, decision: decisionId } : { count: 1, decision: decisionId });
  }
}
