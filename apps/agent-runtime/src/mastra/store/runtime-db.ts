import { createClient, type Client } from '@libsql/client';
import pg from 'pg';

// The one database for AURA's own runtime tables: drafts, the approval ledger, the token ledger
// and model usage (docs/plans/aura-automation-durability.md Part B). Two backends behind one
// small interface:
//   DATABASE_URL set   → Postgres, schema "aura_runtime" (Supabase in the cloud; survives
//                        restarts and is shared by every runtime replica)
//   otherwise          → libSQL file (AURA_DRAFTS_DB_URL, default file:./aura-drafts.db) for a
//                        single local process
// Callers write portable SQL with "?" placeholders; the Postgres backend numbers them ($1, $2…).
// Portable means: no "insert or ignore" (use "on conflict … do nothing"), and wrap aggregate
// results in Number() (Postgres returns sum() of integers as a string).

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowsAffected: number;
}

export interface RuntimeDb {
  dialect: 'libsql' | 'postgres';
  execute(sql: string, args?: readonly unknown[]): Promise<QueryResult>;
}

export const RUNTIME_SCHEMA = 'aura_runtime';

// "?" → "$1", "$2"… outside quoted strings, for Postgres.
export function toPostgresPlaceholders(sql: string): string {
  let index = 0;
  let out = '';
  let quote: "'" | '"' | null = null;
  for (const ch of sql) {
    if (quote) {
      if (ch === quote) quote = null;
      out += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === '?') {
      out += `$${++index}`;
    } else {
      out += ch;
    }
  }
  return out;
}

export function libsqlDb(client: Client): RuntimeDb {
  return {
    dialect: 'libsql',
    async execute(sql, args = []) {
      const result = await client.execute({ sql, args: args as never[] });
      return { rows: result.rows as unknown as Record<string, unknown>[], rowsAffected: result.rowsAffected };
    },
  };
}

// Any Postgres client with pg's query shape: a pg Pool in production, PGlite in tests.
export interface PostgresQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null; affectedRows?: number }>;
}

export function postgresDb(client: PostgresQueryable): RuntimeDb {
  return {
    dialect: 'postgres',
    async execute(sql, args = []) {
      const result = await client.query(toPostgresPlaceholders(sql), [...args]);
      return { rows: result.rows, rowsAffected: result.rowCount ?? result.affectedRows ?? 0 };
    },
  };
}

// Creates the schema and points every pooled connection at it, so table names stay unqualified.
export function postgresPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 5 });
  pool.on('connect', (connection) => {
    void connection.query(`create schema if not exists ${RUNTIME_SCHEMA}; set search_path to ${RUNTIME_SCHEMA}`);
  });
  return pool;
}

let instance: RuntimeDb | null = null;

export function runtimeDb(): RuntimeDb {
  if (!instance) {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    instance = databaseUrl
      ? postgresDb(postgresPool(databaseUrl))
      : libsqlDb(createClient({ url: process.env.AURA_DRAFTS_DB_URL || 'file:./aura-drafts.db', authToken: process.env.AURA_DRAFTS_DB_TOKEN || undefined }));
  }
  return instance;
}

// Swap the backend: tests (in-memory) and the migrate-state script (explicit Postgres target).
export function setRuntimeDb(db: RuntimeDb | null): void {
  instance = db;
}
