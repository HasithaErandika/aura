import { describe, expect, it } from 'vitest';
import { AGENT_MANIFEST } from '../agents/registry';
import { poAgent } from '../agents/po-agent';
import { baAgent } from '../agents/ba-agent';
import { deployerAgent } from '../agents/deployer-agent';
import { generateObjectWith, type AgentLike } from '../lib/generate-object';
import { avgTokens, promotionGate, readBaseline, scoreCase, suiteScore, writeBaseline, type Baseline, type CaseResult, type CaseTokens } from './scoring';
import { SUITES } from './suites';

// Runs every eval suite against the real models (costs a few free-tier requests per case) and
// applies the promotion gate against the committed baseline.
//
//   pnpm --filter agent-runtime eval                       score, compare, write nothing
//   EVAL_UPDATE_BASELINE=1 pnpm --filter agent-runtime eval  also write the baseline if the gate passes
//   EVAL_AGENT=po-agent ...                                 one suite only
//
// Not part of `make test`: it needs model keys and network. baselines.test.ts is the part CI runs.

const AGENTS: Record<string, AgentLike> = { po: poAgent as unknown as AgentLike, ba: baAgent as unknown as AgentLike, deployer: deployerAgent as unknown as AgentLike };
const only = process.env.EVAL_AGENT;
const update = process.env.EVAL_UPDATE_BASELINE === '1';

for (const suite of SUITES.filter((s) => !only || s.agentId === only)) {
  describe(`eval: ${suite.agentId}`, () => {
    it('meets the promotion gate', async () => {
      const manifest = AGENT_MANIFEST[suite.agentId];
      const cases: Record<string, CaseResult> = {};
      for (const c of suite.cases) {
        // Counts this case's tokens (retries included) without touching the production ledger's totals.
        const tokens: CaseTokens = { input: 0, output: 0, calls: 0 };
        const agent = AGENTS[suite.agent]!;
        const counted: AgentLike = {
          generate: async (prompt, options) => {
            const result = await agent.generate(prompt, options);
            const usage = result.totalUsage ?? result.usage;
            tokens.input += usage?.inputTokens ?? 0;
            tokens.output += usage?.outputTokens ?? 0;
            tokens.calls += 1;
            return result;
          },
        };
        try {
          const output = await generateObjectWith(counted, `${suite.agentId}/${c.id}`, c.prompt(), suite.schema, `eval:${suite.agentId}`);
          cases[c.id] = { ...scoreCase(c.checks, output), tokens };
        } catch (error) {
          cases[c.id] = { score: 0, failed: ['valid structured output'], error: error instanceof Error ? error.message.slice(0, 300) : String(error), tokens };
        }
        console.log(`[eval] ${suite.agentId}/${c.id}: ${cases[c.id]!.score.toFixed(2)}${cases[c.id]!.failed.length ? ` (failed: ${cases[c.id]!.failed.join(', ')})` : ''}`);
      }

      const current: Baseline = {
        agentId: suite.agentId,
        agentVersion: manifest.agentVersion,
        promptVersion: manifest.promptVersion,
        modelId: manifest.modelId,
        score: suiteScore(cases),
        avgTokensPerCase: avgTokens(cases),
        cases,
        ranAt: new Date().toISOString(),
      };
      const previous = await readBaseline(suite.agentId);
      const gate = promotionGate(current, previous);
      console.log(`[eval] ${suite.agentId} score ${current.score}, ${current.avgTokensPerCase ?? '?'} tokens/case (baseline ${previous?.score ?? 'none'}, ${previous?.avgTokensPerCase ?? '?'} tokens/case): ${gate.pass ? 'PASS' : `FAIL - ${gate.reason}`}`);
      if (gate.pass && update) await writeBaseline(current);
      expect(gate.pass ? 'pass' : gate.reason).toBe('pass');
    });
  });
}
