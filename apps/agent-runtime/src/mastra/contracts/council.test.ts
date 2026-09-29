import { describe, expect, it } from 'vitest';
import { chooseCouncilMode, LEAN_MAX_CHARS } from './council';

// Lean vs full is chosen at draft time and shown in the plan the human approves, so it must be
// deterministic and explainable.

describe('chooseCouncilMode', () => {
  const small = 'Add a /health endpoint\n- returns 200\n- returns {"status":"ok"}';

  it('honours an explicit setting', () => {
    expect(chooseCouncilMode('full', small).mode).toBe('full');
    expect(chooseCouncilMode('lean', 'Rotate the auth token secret').mode).toBe('lean');
  });

  it('auto: small Tasks run lean', () => {
    expect(chooseCouncilMode('auto', small)).toEqual({ mode: 'lean', reason: 'small Task (2 listed requirements)' });
  });

  it('auto: sensitive areas always run full', () => {
    const r = chooseCouncilMode('auto', 'Add password reset\n- sends an email');
    expect(r.mode).toBe('full');
    expect(r.reason).toContain('password');
  });

  it('auto: many requirements or a long description run full', () => {
    const many = ['Build the list page', ...Array.from({ length: 7 }, (_, i) => `- criterion ${i}`)].join('\n');
    expect(chooseCouncilMode('auto', many).mode).toBe('full');
    expect(chooseCouncilMode('auto', 'x'.repeat(LEAN_MAX_CHARS + 1)).mode).toBe('full');
  });
});
