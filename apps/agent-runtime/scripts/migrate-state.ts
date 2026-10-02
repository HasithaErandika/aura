// One-off copy of AURA's own runtime tables from a local libSQL file into Postgres
// (docs/plans/aura-automation-durability.md Part B, step B5):
//
//   DATABASE_URL=postgresql://... pnpm --filter agent-runtime migrate-state [path/to/aura-drafts.db]
//
// Default source: src/mastra/public/aura-drafts.db (where `mastra dev` keeps it). Safe to run twice.

import { createClient } from '@libsql/client';
import { migrateState } from '../src/mastra/store/migrate-state';
import { postgresDb, postgresPool, RUNTIME_SCHEMA } from '../src/mastra/store/runtime-db';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('Set DATABASE_URL to the target Postgres database');
  process.exit(1);
}
const sourcePath = process.argv[2] ?? 'src/mastra/public/aura-drafts.db';
const pool = postgresPool(databaseUrl);
try {
  for (const r of await migrateState(createClient({ url: `file:${sourcePath}` }), postgresDb(pool))) {
    console.log(`${r.table}: ${r.copied} of ${r.source} rows copied into ${RUNTIME_SCHEMA}.${r.table}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
