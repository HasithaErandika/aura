import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const dir = mkdtempSync(path.join(os.tmpdir(), 'aura-tokens-'));
let ledger: typeof import('./token-ledger');

beforeAll(async () => {
  vi.stubEnv('AURA_DRAFTS_DB_URL', `file:${path.join(dir, 'drafts.db')}`);
  ledger = await import('./token-ledger');
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

describe('token ledger', () => {
  it('adds up calls and tokens per agent and model, with shares and averages', async () => {
    await ledger.recordTokens('orchestrator', 'groq/gpt-oss-120b', { inputTokens: 9000, outputTokens: 300, reasoningTokens: 100, cachedInputTokens: 4000 });
    await ledger.recordTokens('orchestrator', 'groq/gpt-oss-120b', { inputTokens: 7000, outputTokens: 100 });
    await ledger.recordTokens('po-agent', 'google/gemini', { inputTokens: 600, outputTokens: 500 });
    await ledger.recordTokens('po-agent', 'google/gemini', null);
    const report = await ledger.tokenReport(7);
    expect(report.totals).toEqual({ calls: 3, input: 16600, output: 900, reasoning: 100, cached: 4000 });
    expect(report.agents[0]).toMatchObject({ agent: 'orchestrator', calls: 2, avgInput: 8000, avgOutput: 200 });
    expect(report.agents[0]!.share).toBeCloseTo(16400 / 17500, 3);
    expect(report.agents[1]).toMatchObject({ agent: 'po-agent', calls: 1, input: 600, output: 500 });
    expect(report.models.map((m) => m.model)).toEqual(['groq/gpt-oss-120b', 'google/gemini']);
  });

  it('names the model that actually answered', () => {
    expect(ledger.answeringModel({ response: { modelMetadata: { modelProvider: 'groq.chat', modelId: 'gpt-oss-120b' } } })).toBe('groq/gpt-oss-120b');
    expect(ledger.answeringModel({ response: { modelId: 'x' } })).toBe('x');
    expect(ledger.answeringModel(null)).toBe('unknown');
  });
});
