import { registerApiRoute } from '@mastra/core/server';
import { tokenReport } from '../store/token-ledger';

// GET /usage/tokens?days=7 - tokens per agent and model over the last N days (store/token-ledger.ts),
// plus how much draft text the gateway kept out of the Orchestrator's context. apps/api serves it
// to admins as GET /dashboard/token-usage.
export const tokenUsageRoute = registerApiRoute('/usage/tokens', {
  method: 'GET',
  handler: async (c) => {
    const days = Math.min(90, Math.max(1, Number(c.req.query('days')) || 7));
    return c.json(await tokenReport(days));
  },
});
