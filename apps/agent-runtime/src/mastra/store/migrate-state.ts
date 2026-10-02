import type { Client } from '@libsql/client';
import { setRuntimeDb, type RuntimeDb } from './runtime-db';

// Copies AURA's own runtime tables from a local libSQL file into another runtime database
// (Postgres in the cloud). Used by scripts/migrate-state.ts. Safe to run twice: existing rows are
// skipped. Mastra's own memory (mastra.db) is not copied.

const TABLES: Record<string, string[]> = {
  aura_drafts: ['id'],
  aura_approval_uses: ['approval_id'],
  aura_token_usage: ['day', 'agent', 'model'],
};

export interface MigrateResult {
  table: string;
  source: number;
  copied: number;
}

export async function migrateState(source: Client, target: RuntimeDb): Promise<MigrateResult[]> {
  // Create the target tables through the stores themselves, so the schema matches exactly.
  setRuntimeDb(target);
  const { draftStore } = await import('./draft-store');
  const { claimApproval } = await import('../gateway/approval-ledger');
  const { tokenReport } = await import('./token-ledger');
  await Promise.all([draftStore.get('none'), tokenReport(1)]);
  await claimApproval('__migrate_probe__', '__probe__', '__probe__', null);
  await target.execute('delete from aura_approval_uses where approval_id = ?', ['__migrate_probe__']);

  const present = new Set((await source.execute("select name from sqlite_master where type = 'table'")).rows.map((r) => String(r.name)));
  const results: MigrateResult[] = [];
  for (const [table, keys] of Object.entries(TABLES)) {
    if (!present.has(table)) continue;
    const rows = (await source.execute(`select * from ${table}`)).rows as unknown as Record<string, unknown>[];
    let copied = 0;
    for (const row of rows) {
      const columns = Object.keys(row);
      const sql = `insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')}) on conflict (${keys.join(', ')}) do nothing`;
      copied += (await target.execute(sql, columns.map((c) => row[c]))).rowsAffected;
    }
    results.push({ table, source: rows.length, copied });
  }
  return results;
}
