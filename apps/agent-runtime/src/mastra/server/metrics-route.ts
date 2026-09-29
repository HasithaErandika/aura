import { registerApiRoute } from '@mastra/core/server';
import { renderMetrics } from '../lib/metrics';

// Prometheus scrape endpoint. Behind the same bearer token as every other runtime route
// (server/runtime-auth.ts): point Prometheus at it with `authorization: { credentials: <token> }`.
export const metricsRoute = registerApiRoute('/metrics', {
  method: 'GET',
  handler: async (c) => c.text(renderMetrics(), 200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' }),
});
