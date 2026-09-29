import { describe, expect, it } from 'vitest';
import { AGENT_MANIFEST } from '../agents/registry';
import { MIN_SCORE, avgTokens, promotionGate, readBaseline, scoreCase, suiteScore, type Baseline } from './scoring';
import { SUITES } from './suites';

// The CI half of the eval gate (no model calls): every evaluated agent must have a committed
// baseline recorded for its CURRENT agent version, prompt version and model, with the current set
// of cases, at or above the minimum score. Changing a prompt means bumping its promptVersion in
// agents/registry.ts, which fails here until someone runs
//   EVAL_UPDATE_BASELINE=1 pnpm --filter agent-runtime eval
// and commits the new baseline - the recorded, reviewable promotion.
//
// A suite that has never been baselined is reported as pending (skipped), not failed: its first
// recording is the promotion. Once a baseline exists, any version drift fails.

const baselines = new Map<string, Baseline | null>(await Promise.all(SUITES.map(async (s) => [s.agentId, await readBaseline(s.agentId)] as const)));

describe('eval baselines', () => {
  for (const suite of SUITES) {
    const pending = !baselines.get(suite.agentId);
    it.skipIf(pending)(`${suite.agentId} has a passing baseline for its current version${pending ? ' (pending: never recorded)' : ''}`, async () => {
      const manifest = AGENT_MANIFEST[suite.agentId];
      const baseline = baselines.get(suite.agentId) ?? null;
      const hint = 'run EVAL_UPDATE_BASELINE=1 pnpm --filter agent-runtime eval and commit evals/baselines/';
      expect(baseline, `no baseline - ${hint}`).not.toBeNull();
      expect({ agentVersion: baseline!.agentVersion, promptVersion: baseline!.promptVersion, modelId: baseline!.modelId }, `baseline is for another version - ${hint}`).toEqual({
        agentVersion: manifest.agentVersion,
        promptVersion: manifest.promptVersion,
        modelId: manifest.modelId,
      });
      expect(Object.keys(baseline!.cases).sort(), `the cases changed - ${hint}`).toEqual(suite.cases.map((c) => c.id).sort());
      expect(baseline!.score).toBeGreaterThanOrEqual(MIN_SCORE);
    });
  }
});

describe('eval scoring', () => {
  it('weights checks and treats a throwing check as failed', () => {
    const result = scoreCase<{ n: number }>(
      [
        { name: 'big', weight: 3, test: (o) => o.n > 1 },
        { name: 'odd', test: (o) => o.n % 2 === 1 },
        {
          name: 'throws',
          test: () => {
            throw new Error('x');
          },
        },
      ],
      { n: 4 },
    );
    expect(result).toEqual({ score: 0.6, failed: ['odd', 'throws'] });
    expect(suiteScore({ a: { score: 1, failed: [] }, b: { score: 0.5, failed: [] } })).toBe(0.75);
  });

  it('gates promotion on the minimum and on regression', () => {
    const prev = { score: 0.95, agentVersion: '1.0.0', promptVersion: '1.0.0' };
    expect(promotionGate({ score: 0.9 }, prev)).toEqual({ pass: true });
    expect(promotionGate({ score: 0.9 }, null)).toEqual({ pass: true });
    expect(promotionGate({ score: 0.7 }, null)).toMatchObject({ pass: false, reason: expect.stringMatching(/below the minimum/) });
    expect(promotionGate({ score: 0.82 }, prev)).toMatchObject({ pass: false, reason: expect.stringMatching(/regressed/) });
  });

  it('gates promotion on token growth when both sides were measured', () => {
    const prev = { score: 0.9, avgTokensPerCase: 1000, agentVersion: '1.0.0', promptVersion: '1.0.0' };
    expect(promotionGate({ score: 0.9, avgTokensPerCase: 1200 }, prev)).toEqual({ pass: true });
    expect(promotionGate({ score: 0.9, avgTokensPerCase: 1300 }, prev)).toMatchObject({ pass: false, reason: expect.stringMatching(/1300 tokens per case/) });
    expect(promotionGate({ score: 0.9, avgTokensPerCase: 5000 }, { ...prev, avgTokensPerCase: undefined })).toEqual({ pass: true });
    expect(avgTokens({ a: { score: 1, failed: [], tokens: { input: 100, output: 50, calls: 1 } }, b: { score: 1, failed: [], tokens: { input: 300, output: 50, calls: 2 } } })).toBe(250);
    expect(avgTokens({ a: { score: 1, failed: [] } })).toBeUndefined();
  });
});
