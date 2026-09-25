import { db } from './draft-store';
import { KNOWN_DAILY_REQUEST_LIMITS } from '../config/models';

// Per-day, per-model request and token counts for the Coding Council, so a developer can see how
// much of the free tiers' daily quota is left (`aura status`, GET /council/usage). Counts only
// calls AURA itself made; the provider's own dashboard is the source of truth.

let ready: Promise<void> | null = null;

async function table() {
  const c = await db();
  if (!ready) {
    ready = c
      .execute(
        `create table if not exists aura_model_usage (
          day text not null,
          model text not null,
          requests integer not null default 0,
          tokens integer not null default 0,
          primary key (day, model)
        )`,
      )
      .then(() => undefined);
  }
  await ready;
  return c;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordModelUsage(model: string, tokens: number): Promise<void> {
  const c = await table();
  await c.execute({
    sql: `insert into aura_model_usage (day, model, requests, tokens) values (?, ?, 1, ?)
          on conflict (day, model) do update set requests = requests + 1, tokens = tokens + excluded.tokens`,
    args: [today(), model, Math.max(0, Math.round(tokens))],
  });
}

export async function usageToday(): Promise<{ date: string; providers: Record<string, { requests: number; tokens: number; dailyRequestLimit: number | null }> }> {
  const c = await table();
  const day = today();
  const result = await c.execute({ sql: 'select model, requests, tokens from aura_model_usage where day = ? order by requests desc', args: [day] });
  const providers: Record<string, { requests: number; tokens: number; dailyRequestLimit: number | null }> = {};
  for (const row of result.rows as unknown as { model: string; requests: number; tokens: number }[]) {
    providers[row.model] = { requests: Number(row.requests), tokens: Number(row.tokens), dailyRequestLimit: KNOWN_DAILY_REQUEST_LIMITS[row.model] ?? null };
  }
  return { date: day, providers };
}
