import { describe, expect, it } from 'vitest';
import { callSignature, LoopGuard, limitsFromEnv } from './loop-guard';

const limits = { identicalCalls: 3, consecutiveFailures: 2, revisions: 4, windowMs: 1000 };

describe('LoopGuard', () => {
  it('refuses the Nth identical call inside the window, and allows it again after', () => {
    let now = 0;
    const g = new LoopGuard(limits, () => now);
    expect(g.check('t', 'tool', { a: 1 }, null, null, false)).toBeNull();
    expect(g.check('t', 'tool', { a: 1 }, null, null, false)).toBeNull();
    expect(g.check('t', 'tool', { a: 1 }, null, null, false)).toMatch(/HALTED_LOOP_GUARD/);
    expect(g.check('t', 'tool', { a: 2 }, null, null, false)).toBeNull();
    expect(g.check('other-thread', 'tool', { a: 1 }, null, null, false)).toBeNull();
    now = 2000;
    expect(g.check('t', 'tool', { a: 1 }, null, null, false)).toBeNull();
  });

  it('treats key order as the same call', () => {
    expect(callSignature('t', { a: 1, b: { c: 2, d: 3 } })).toBe(callSignature('t', { b: { d: 3, c: 2 }, a: 1 }));
    expect(callSignature('t', { a: 1 })).not.toBe(callSignature('u', { a: 1 }));
  });

  it('pauses a tool after a failure streak until a success or a new human decision', () => {
    const g = new LoopGuard(limits);
    g.record('t', 'tool', false, null);
    g.record('t', 'tool', false, null);
    expect(g.check('t', 'tool', { x: 1 }, null, null, false)).toMatch(/failed 2 times/);
    expect(g.check('t', 'other', { x: 1 }, null, null, false)).toBeNull();
    expect(g.check('t', 'tool', { x: 2 }, 'appr-1', null, false)).toBeNull();
    g.record('t', 'tool', true, null);
    expect(g.check('t', 'tool', { x: 3 }, null, null, false)).toBeNull();
  });

  it('refuses revising a draft at the version limit', () => {
    const g = new LoopGuard(limits);
    expect(g.check('t', 'tool', { v: 3 }, null, 3, true)).toBeNull();
    expect(g.check('t', 'tool', { v: 4 }, null, 4, true)).toMatch(/version 4 \(limit 4\)/);
    expect(g.check('t', 'tool', { v: 5 }, null, 4, false)).toBeNull();
  });

  it('reads limits from the environment within bounds', () => {
    expect(limitsFromEnv({})).toMatchObject({ identicalCalls: 3, consecutiveFailures: 3, revisions: 10 });
    expect(limitsFromEnv({ GATEWAY_MAX_REVISIONS: '20', GATEWAY_MAX_IDENTICAL_CALLS: '1' })).toMatchObject({ revisions: 20, identicalCalls: 3 });
  });
});
