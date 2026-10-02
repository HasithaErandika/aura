import { createClient } from '@libsql/client';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { libsqlDb, postgresDb, toPostgresPlaceholders, type RuntimeDb } from './runtime-db';

// The runtime's own tables must behave the same on libSQL (local) and Postgres (cloud). PGlite is
// real Postgres compiled to WebAssembly, so the Postgres path is tested without a server.

describe('toPostgresPlaceholders', () => {
  it('numbers placeholders and leaves quoted question marks alone', () => {
    expect(toPostgresPlaceholders("select * from t where a = ? and b = '?' and c = ?")).toBe("select * from t where a = $1 and b = '?' and c = $2");
  });
});

const pglite = new PGlite();
afterAll(async () => {
  await pglite.close();
});

const backends: { name: string; make: () => RuntimeDb }[] = [
  { name: 'libSQL', make: () => libsqlDb(createClient({ url: ':memory:' })) },
  { name: 'Postgres (PGlite)', make: () => postgresDb(pglite) },
];

describe.each(backends)('runtime stores on $name', ({ make }) => {
  let stores: {
    drafts: typeof import('./draft-store');
    approvals: typeof import('../gateway/approval-ledger');
    tokens: typeof import('./token-ledger');
    usage: typeof import('./usage-store');
  };

  beforeAll(async () => {
    vi.resetModules();
    const { setRuntimeDb } = await import('./runtime-db');
    setRuntimeDb(make());
    stores = {
      drafts: await import('./draft-store'),
      approvals: await import('../gateway/approval-ledger'),
      tokens: await import('./token-ledger'),
      usage: await import('./usage-store'),
    };
  });

  it('creates, versions, files and lists drafts', async () => {
    const { draftStore } = stores.drafts;
    const v1 = await draftStore.create({ kind: 'epic', content: { title: 'Reset password' }, threadId: 't1' });
    const v2 = await draftStore.create({ kind: 'epic', content: { title: 'Reset password v2' }, threadId: 't1', parentId: v1.id });
    expect(v2.version).toBe(2);
    expect((await draftStore.get<{ title: string }>(v2.id))?.content.title).toBe('Reset password v2');
    await draftStore.markFiled(v2.id, { '0': 'KAN-36' }, 'KAN-36');
    expect((await draftStore.get(v2.id))?.filed).toEqual({ '0': 'KAN-36' });
    expect(await draftStore.latestThreadFor('epic', 'KAN-36')).toBe('t1');
    expect((await draftStore.latestByEpic('epic', 'KAN-36'))?.id).toBe(v2.id);
    expect(await draftStore.listByEpic('epic', 'KAN-36', 5)).toHaveLength(1);
    expect(await draftStore.get('EPIC-missing')).toBeNull();
  });

  it('lets an approval be claimed once, retried by the same step, refused for another', async () => {
    const { claimApproval } = stores.approvals;
    expect(await claimApproval('appr-1', 'delegate_to_po', 'EPIC-1', 't1')).toEqual({ ok: true, firstUse: true });
    expect(await claimApproval('appr-1', 'delegate_to_po', 'EPIC-1', 't1')).toEqual({ ok: true, firstUse: false });
    expect(await claimApproval('appr-1', 'delegate_to_code', 'CODE-1', 't1')).toEqual({ ok: false, usedFor: { tool: 'delegate_to_po', draftId: 'EPIC-1' } });
  });

  it('adds token usage up per day, agent and model, and reports numbers', async () => {
    const { recordTokens, tokenReport } = stores.tokens;
    await recordTokens('po-agent', 'groq/x', { inputTokens: 100, outputTokens: 10 });
    await recordTokens('po-agent', 'groq/x', { inputTokens: 50, outputTokens: 5, reasoningTokens: 3 });
    await recordTokens('ba-agent', 'google/y', { inputTokens: 20, outputTokens: 2 });
    const report = await tokenReport(1);
    expect(report.totals).toEqual({ calls: 3, input: 170, output: 17, reasoning: 3, cached: 0 });
    expect(report.agents[0]).toMatchObject({ agent: 'po-agent', calls: 2, input: 150, output: 15 });
    expect(typeof report.models[0]?.input).toBe('number');
  });

  it('counts model requests per day', async () => {
    const { recordModelUsage, usageToday } = stores.usage;
    await recordModelUsage('groq/x', 1000);
    await recordModelUsage('groq/x', 500);
    expect((await usageToday()).providers['groq/x']).toMatchObject({ requests: 2, tokens: 1500 });
  });
});

describe('migrateState', () => {
  it('copies local tables into Postgres once, skipping rows that already exist', async () => {
    vi.resetModules();
    const source = createClient({ url: ':memory:' });
    await source.execute(`create table aura_drafts (id text primary key, kind text not null, version integer not null, parent_id text, thread_id text, epic_key text, content text not null, filed text not null default '{}', created_at text not null)`);
    await source.execute(`insert into aura_drafts values ('EPIC-1', 'epic', 1, null, 't1', 'KAN-36', '{"title":"x"}', '{}', '2026-09-29T00:00:00Z')`);
    await source.execute(`create table aura_model_usage (day text not null, model text not null, requests integer not null default 0, tokens integer not null default 0, primary key (day, model))`);
    await source.execute(`insert into aura_model_usage values ('2026-09-29', 'groq/x', 3, 900)`);

    const target = postgresDb(new PGlite());
    const { migrateState } = await import('./migrate-state');
    expect(await migrateState(source, target)).toEqual([
      { table: 'aura_drafts', source: 1, copied: 1 },
      { table: 'aura_model_usage', source: 1, copied: 1 },
    ]);
    expect((await target.execute('select epic_key from aura_drafts where id = ?', ['EPIC-1'])).rows[0]?.epic_key).toBe('KAN-36');
    expect((await migrateState(source, target)).map((r) => r.copied)).toEqual([0, 0]);
  });
});
