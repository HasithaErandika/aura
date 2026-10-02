import { dbError } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { NotificationInput, NotificationRow } from "./notifications.types.js";

const COLUMNS = "id, kind, title, body, link, task_key, created_at, read_at";
const TITLE_CHARS = 200;
const BODY_CHARS = 2000;

export const notificationsRepository = {
  async insertFor(userIds: string[], n: NotificationInput): Promise<{ message: string } | null> {
    const rows = userIds.map((user_id) => ({ user_id, kind: n.kind, title: n.title.slice(0, TITLE_CHARS), body: (n.body ?? "").slice(0, BODY_CHARS), link: n.link ?? null, task_key: n.taskKey ?? null }));
    const { error } = await supabaseAdmin.from("notifications").insert(rows);
    return error;
  },

  async listFor(userId: string, limit: number): Promise<NotificationRow[]> {
    const { data, error } = await supabaseAdmin.from("notifications").select(COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw dbError("Could not read notifications", error);
    return (data ?? []) as NotificationRow[];
  },

  async countUnread(userId: string): Promise<number> {
    const { count, error } = await supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
    if (error) throw dbError("Could not count notifications", error);
    return count ?? 0;
  },

  async markRead(userId: string, ids?: string[]): Promise<void> {
    let query = supabaseAdmin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (ids?.length) query = query.in("id", ids);
    const { error } = await query;
    if (error) throw dbError("Could not mark notifications read", error);
  },
};
