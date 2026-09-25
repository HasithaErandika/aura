import type { TurnEvent } from '@aura/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTurn } from './render.js';

let printed = '';
beforeEach(() => {
  printed = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    printed += String(chunk);
    return true;
  });
});
afterEach(() => vi.restoreAllMocks());

async function* stream(events: TurnEvent[]): AsyncGenerator<TurnEvent> {
  for (const e of events) yield e;
}

describe('renderTurn', () => {
  it('returns the gate to decide and the coding draft id', async () => {
    const outcome = await renderTurn(
      stream([
        { event: 'tool', data: { phase: 'result', toolName: 'delegate_to_code', toolCallId: 'c1', result: { ok: true, draftId: 'CODE-1' } } },
        { event: 'gate', data: { approvalId: 'ap1', runId: 'r1', producingAgent: 'coding-agent', gate: { number: 5, name: 'Coding agent approval', outcome: '' }, question: 'Run it?', options: [], snapshot: null, canDecide: true } },
        { event: 'done', data: { runId: 'r1', status: 'SUSPENDED_FOR_APPROVAL', approvalId: 'ap1' } },
      ]),
    );
    expect(outcome).toMatchObject({ status: 'SUSPENDED_FOR_APPROVAL', approvalId: 'ap1', draftId: 'CODE-1', error: null });
    expect(printed).toContain('Gate 5');
    expect(printed).toContain('aura approve');
  });

  it('prints a council turn as a discussion with its verdict and issues', async () => {
    await renderTurn(
      stream([
        { event: 'council', data: { draftId: 'CODE-2', round: 1, phase: 'review', role: 'reviewer', model: 'google/gemini', status: 'done', text: 'Close.', verdict: 'CHANGES', issues: [{ file: 'src/a.ts', line: 3, severity: 'major', problem: 'no validation', fix: 'use zod' }] } },
        { event: 'done', data: { runId: 'r2', status: 'SUCCEEDED', approvalId: null } },
      ]),
    );
    expect(printed).toContain('Reviewer');
    expect(printed).toContain('CHANGES REQUESTED');
    expect(printed).toContain('src/a.ts:3');
  });

  it('surfaces a runtime error', async () => {
    const outcome = await renderTurn(stream([{ event: 'error', data: { message: 'boom' } }, { event: 'done', data: { runId: 'r3', status: 'FAILED', approvalId: null } }]));
    expect(outcome).toMatchObject({ status: 'FAILED', error: 'boom' });
  });
});
