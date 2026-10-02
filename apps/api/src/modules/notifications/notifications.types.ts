type NotificationKind = "pr_opened" | "pr_merged" | "ci_passed" | "ci_failed";

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string | null;
  taskKey?: string | null;
}

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  task_key: string | null;
  created_at: string;
  read_at: string | null;
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

export function toNotificationView(row: NotificationRow): NotificationView {
  return { id: row.id, kind: row.kind, title: row.title, body: row.body, link: row.link, taskKey: row.task_key, createdAt: row.created_at, readAt: row.read_at };
}
