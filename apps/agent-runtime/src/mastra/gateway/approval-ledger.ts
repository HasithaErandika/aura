import { runtimeDb } from '../store/runtime-db';

// Each human decision authorizes one gated step (docs/ARCHITECTURE.md §2.2: "single-use,
// payload-bound approval"). The first medium-risk call after a decision claims it for that tool
// and draft; the same call again (a retry, which every execute/file mode handles idempotently)
// is allowed, anything else is refused. Durable, in the same runtime database as the drafts (store/runtime-db.ts), so a
// restart can't make a used approval usable again.

let ready: Promise<void> | null = null;

async function table() {
  const c = runtimeDb();
  if (!ready) {
    ready = c
      .execute(
        `create table if not exists aura_approval_uses (
          approval_id text primary key,
          tool text not null,
          draft_id text not null,
          thread_id text,
          used_at text not null
        )`,
      )
      .then(() => undefined);
  }
  await ready;
  return c;
}

export type ClaimResult = { ok: true; firstUse: boolean } | { ok: false; usedFor: { tool: string; draftId: string } };

export async function claimApproval(approvalId: string, tool: string, draftId: string, threadId: string | null): Promise<ClaimResult> {
  const c = await table();
  // insert (on conflict do nothing) then read back: two concurrent claims can't both win.
  const inserted = await c.execute('insert into aura_approval_uses (approval_id, tool, draft_id, thread_id, used_at) values (?, ?, ?, ?, ?) on conflict (approval_id) do nothing', [approvalId, tool, draftId, threadId, new Date().toISOString()]);
  if (inserted.rowsAffected === 1) return { ok: true, firstUse: true };
  const row = (await c.execute('select tool, draft_id from aura_approval_uses where approval_id = ?', [approvalId])).rows[0];
  const usedFor = { tool: String(row?.tool ?? ''), draftId: String(row?.draft_id ?? '') };
  return usedFor.tool === tool && usedFor.draftId === draftId ? { ok: true, firstUse: false } : { ok: false, usedFor };
}
