import { randomBytes } from 'node:crypto';
import type { DraftKind } from '../contracts/drafts';
import { runtimeDb, type RuntimeDb } from './runtime-db';

// Durable store for agent drafts, keyed by short ids the Orchestrator passes around instead
// of the draft text. Survives restarts, so a gate that stays open overnight still resolves.

export interface DraftRecord<T = unknown> {
  id: string;
  kind: DraftKind;
  version: number;
  parentId: string | null;
  threadId: string | null;
  epicKey: string | null;
  content: T;
  // Jira keys created from this draft, per item index. Makes filing idempotent on retry.
  filed: Record<string, string>;
  createdAt: string;
}

let ready: Promise<void> | null = null;

// The runtime database with the drafts table ensured.
async function db(): Promise<RuntimeDb> {
  const c = runtimeDb();
  if (!ready) {
    ready = c
      .execute(
        `create table if not exists aura_drafts (
          id text primary key,
          kind text not null,
          version integer not null,
          parent_id text,
          thread_id text,
          epic_key text,
          content text not null,
          filed text not null default '{}',
          created_at text not null
        )`,
      )
      .then(() => undefined);
  }
  await ready;
  return c;
}

const ID_PREFIX: Record<DraftKind, string> = {
  epic: 'EPIC',
  stories: 'STORIES',
  architecture: 'ARCH',
  'qa-plan': 'QA',
  'deploy-plan': 'DEPLOY',
  'task-plan': 'PLAN',
  'task-review': 'REVIEW',
  'task-pr': 'PR',
};

// Generates a short random id prefixed by the draft kind.
function newId(kind: DraftKind): string {
  return `${ID_PREFIX[kind]}-${randomBytes(4).toString('hex')}`;
}

// Converts a raw database row into a typed DraftRecord.
function rowToRecord<T>(row: Record<string, unknown>): DraftRecord<T> {
  return {
    id: String(row.id),
    kind: row.kind as DraftKind,
    version: Number(row.version),
    parentId: (row.parent_id as string | null) ?? null,
    threadId: (row.thread_id as string | null) ?? null,
    epicKey: (row.epic_key as string | null) ?? null,
    content: JSON.parse(String(row.content)) as T,
    filed: JSON.parse(String(row.filed || '{}')) as Record<string, string>,
    createdAt: String(row.created_at),
  };
}

export const draftStore = {
  // Creates a new draft, versioned from its parent if one is given.
  async create<T>(input: { kind: DraftKind; content: T; threadId?: string | null; epicKey?: string | null; parentId?: string | null }): Promise<DraftRecord<T>> {
    const c = await db();
    let version = 1;
    if (input.parentId) {
      const parent = await this.get<T>(input.parentId);
      if (parent) version = parent.version + 1;
    }
    const record: DraftRecord<T> = {
      id: newId(input.kind),
      kind: input.kind,
      version,
      parentId: input.parentId ?? null,
      threadId: input.threadId ?? null,
      epicKey: input.epicKey ?? null,
      content: input.content,
      filed: {},
      createdAt: new Date().toISOString(),
    };
    await c.execute('insert into aura_drafts (id, kind, version, parent_id, thread_id, epic_key, content, filed, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)', [record.id, record.kind, record.version, record.parentId, record.threadId, record.epicKey, JSON.stringify(record.content), '{}', record.createdAt]);
    return record;
  },

  // Fetches a draft by id, or null if it doesn't exist.
  async get<T>(id: string): Promise<DraftRecord<T> | null> {
    const c = await db();
    const result = await c.execute('select * from aura_drafts where id = ?', [id]);
    const row = result.rows[0];
    return row ? rowToRecord<T>(row) : null;
  },

  // Records which Jira issues a draft's items were filed as, and optionally its Epic key.
  async markFiled(id: string, filed: Record<string, string>, epicKey?: string | null): Promise<void> {
    const c = await db();
    await c.execute(epicKey ? 'update aura_drafts set filed = ?, epic_key = ? where id = ?' : 'update aura_drafts set filed = ? where id = ?', epicKey ? [JSON.stringify(filed), epicKey, id] : [JSON.stringify(filed), id]);
  },

  // The thread that most recently drafted this kind for an Epic, so the web app can continue it.
  async latestThreadFor(kind: DraftKind, epicKey: string): Promise<string | null> {
    const c = await db();
    const result = await c.execute('select thread_id from aura_drafts where kind = ? and epic_key = ? order by created_at desc limit 1', [kind, epicKey]);
    const row = result.rows[0];
    return (row?.thread_id as string | null | undefined) ?? null;
  },

  // The most recent draft of this kind for an Epic.
  async latestByEpic<T>(kind: DraftKind, epicKey: string): Promise<DraftRecord<T> | null> {
    const c = await db();
    const result = await c.execute('select * from aura_drafts where kind = ? and epic_key = ? order by created_at desc limit 1', [kind, epicKey]);
    const row = result.rows[0];
    return row ? rowToRecord<T>(row) : null;
  },

  // The most recent draft of this kind in a conversation.
  async latestByThread<T>(kind: DraftKind, threadId: string): Promise<DraftRecord<T> | null> {
    const c = await db();
    const result = await c.execute('select * from aura_drafts where kind = ? and thread_id = ? order by created_at desc limit 1', [kind, threadId]);
    const row = result.rows[0];
    return row ? rowToRecord<T>(row) : null;
  },

  // Every draft of this kind for an Epic, most recent first.
  async listByEpic<T>(kind: DraftKind, epicKey: string, limit = 50): Promise<DraftRecord<T>[]> {
    const c = await db();
    const result = await c.execute('select * from aura_drafts where kind = ? and epic_key = ? order by created_at desc limit ?', [kind, epicKey, limit]);
    return result.rows.map((row) => rowToRecord<T>(row));
  },
};
