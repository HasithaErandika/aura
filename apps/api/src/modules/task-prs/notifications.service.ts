import { supabaseAdmin } from "../../lib/supabase.js";
import { logger } from "../../lib/logger.js";
import type { Role } from "../identity/roles.js";

// In-app notifications (migration 0012): QA hears when a Task's PR opens and when its CI finishes
// or fails (plan, "Web app after this change"); the developer who opened the PR hears about CI too.

export type NotificationKind = "pr_opened" | "ci_passed" | "ci_failed";

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string | null;
  taskKey?: string | null;
}

export interface NotificationView {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  taskKey: string | null;
  createdAt: string;
  readAt: string | null;
}

interface Row {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  task_key: string | null;
  created_at: string;
  read_at: string | null;
}

const toView = (r: Row): NotificationView => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, taskKey: r.task_key, createdAt: r.created_at, readAt: r.read_at });

function dbError(context: string, error: { message: string }): Error {
  return new Error(`${context}: ${error.message}${/notifications/.test(error.message) ? " (apply supabase/migrations/0012_task_prs_notifications.sql)" : ""}`);
}

export async function usersWithRole(role: Role): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from("profiles").select("id").eq("role", role);
  if (error) throw dbError("Could not read users", error);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

// Best effort: a notification that fails to save never fails the PR or CI step that caused it.
export async function notify(userIds: (string | null | undefined)[], n: NotificationInput): Promise<number> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return 0;
  const { error } = await supabaseAdmin.from("notifications").insert(ids.map((user_id) => ({ user_id, kind: n.kind, title: n.title.slice(0, 200), body: (n.body ?? "").slice(0, 2000), link: n.link ?? null, task_key: n.taskKey ?? null })));
  if (error) {
    logger.warn("notification not saved", { err: error.message, kind: n.kind });
    return 0;
  }
  return ids.length;
}

export async function listNotifications(userId: string, limit = 30): Promise<{ notifications: NotificationView[]; unread: number }> {
  const [list, unread] = await Promise.all([
    supabaseAdmin.from("notifications").select("id, kind, title, body, link, task_key, created_at, read_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit),
    supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
  ]);
  if (list.error) throw dbError("Could not read notifications", list.error);
  if (unread.error) throw dbError("Could not count notifications", unread.error);
  return { notifications: ((list.data ?? []) as Row[]).map(toView), unread: unread.count ?? 0 };
}

// Marks the given notifications (or all of them) read, for this user only.
export async function markRead(userId: string, ids?: string[]): Promise<void> {
  let q = supabaseAdmin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  if (ids?.length) q = q.in("id", ids);
  const { error } = await q;
  if (error) throw dbError("Could not mark notifications read", error);
}
