import { runtimeDb } from './runtime-db';
import { metrics } from '../lib/metrics';

// Token accounting for every model call AURA makes: the Orchestrator's turns, every helper agent's
// structured call (lib/generate-object.ts), the Coding Council and the single coding agent. One
// row per day x agent x model, in the same libSQL database as the drafts, plus Prometheus counters.
// GET /usage/tokens reports it (server/usage-routes.ts); docs/ARCHITECTURE.md §6 explains the
// numbers. Recording never fails a call: errors are logged and dropped.

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

let ready: Promise<void> | null = null;

async function table() {
  const c = runtimeDb();
  if (!ready) {
    ready = c
      .execute(
        `create table if not exists aura_token_usage (
          day text not null,
          agent text not null,
          model text not null,
          calls integer not null default 0,
          input integer not null default 0,
          output integer not null default 0,
          reasoning integer not null default 0,
          cached integer not null default 0,
          primary key (day, agent, model)
        )`,
      )
      .then(() => undefined);
  }
  await ready;
  return c;
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

export async function recordTokens(agent: string, model: string, usage: TokenUsage | undefined | null): Promise<void> {
  if (!usage) return;
  const row = { input: n(usage.inputTokens), output: n(usage.outputTokens), reasoning: n(usage.reasoningTokens), cached: n(usage.cachedInputTokens) };
  metrics.modelCalls.inc({ agent });
  for (const [type, value] of Object.entries(row)) if (value) metrics.modelTokens.inc({ agent, type }, value);
  try {
    const c = await table();
    await c.execute(`insert into aura_token_usage (day, agent, model, calls, input, output, reasoning, cached) values (?, ?, ?, 1, ?, ?, ?, ?)
            on conflict (day, agent, model) do update set calls = aura_token_usage.calls + 1, input = aura_token_usage.input + excluded.input,
            output = aura_token_usage.output + excluded.output, reasoning = aura_token_usage.reasoning + excluded.reasoning,
            cached = aura_token_usage.cached + excluded.cached`, [new Date().toISOString().slice(0, 10), agent, model, row.input, row.output, row.reasoning, row.cached]);
  } catch (error) {
    console.warn(`[aura-tokens] could not record usage for ${agent}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Fire-and-forget form for call sites that must not wait on the database.
export function trackTokens(agent: string, model: string, usage: TokenUsage | undefined | null): void {
  void recordTokens(agent, model, usage);
}

export interface AgentTokenRow {
  agent: string;
  calls: number;
  input: number;
  output: number;
  reasoning: number;
  cached: number;
  avgInput: number;
  avgOutput: number;
  share: number; // of all input + output tokens in the window, 0-1
}

export interface TokenReport {
  since: string;
  days: number;
  totals: { calls: number; input: number; output: number; reasoning: number; cached: number };
  agents: AgentTokenRow[];
  models: { model: string; calls: number; input: number; output: number }[];
  // Characters of draft text kept out of the Orchestrator's context since the runtime started
  // (gateway/gateway.ts), and the rough token equivalent (~4 characters per token).
  contextSaved: { chars: number; approxTokens: number };
}

export async function tokenReport(days = 7): Promise<TokenReport> {
  const c = await table();
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const byAgent = await c.execute(`select agent, sum(calls) calls, sum(input) input, sum(output) output, sum(reasoning) reasoning, sum(cached) cached
          from aura_token_usage where day >= ? group by agent order by sum(input) + sum(output) desc`, [since]);
  const byModel = await c.execute(`select model, sum(calls) calls, sum(input) input, sum(output) output from aura_token_usage where day >= ? group by model order by sum(input) desc`, [since]);
  const rows = byAgent.rows.map((r) => ({ agent: String(r.agent), calls: Number(r.calls), input: Number(r.input), output: Number(r.output), reasoning: Number(r.reasoning), cached: Number(r.cached) }));
  const totals = rows.reduce((t, r) => ({ calls: t.calls + r.calls, input: t.input + r.input, output: t.output + r.output, reasoning: t.reasoning + r.reasoning, cached: t.cached + r.cached }), { calls: 0, input: 0, output: 0, reasoning: 0, cached: 0 });
  const all = totals.input + totals.output || 1;
  const saved = metrics.contextCharsSaved.total();
  return {
    since,
    days,
    totals,
    agents: rows.map((r) => ({ ...r, avgInput: Math.round(r.input / (r.calls || 1)), avgOutput: Math.round(r.output / (r.calls || 1)), share: Math.round(((r.input + r.output) / all) * 1000) / 1000 })),
    models: byModel.rows.map((r) => ({ model: String(r.model), calls: Number(r.calls), input: Number(r.input), output: Number(r.output) })),
    contextSaved: { chars: saved, approxTokens: Math.round(saved / 4) },
  };
}

// The model that actually answered, after any fallback, from a Mastra generate/stream result.
export function answeringModel(result: { response?: { modelId?: string; modelMetadata?: { modelProvider?: string; modelId?: string } } } | null | undefined): string {
  const meta = result?.response?.modelMetadata;
  if (meta?.modelProvider && meta.modelId) return `${meta.modelProvider.split('.')[0]}/${meta.modelId}`;
  return result?.response?.modelId ?? 'unknown';
}
