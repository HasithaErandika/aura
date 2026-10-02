import { logger } from "../../lib/logger.js";
import { notificationsRepository } from "./notifications.repository.js";
import { toNotificationView, type NotificationInput, type NotificationView } from "./notifications.types.js";

const LIST_LIMIT = 30;

// Best effort: a notification that fails to save never fails the step that caused it.
export async function notify(userIds: (string | null | undefined)[], n: NotificationInput): Promise<number> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return 0;
  const error = await notificationsRepository.insertFor(ids, n);
  if (error) {
    logger.warn("notification not saved", { err: error.message, kind: n.kind });
    return 0;
  }
  return ids.length;
}

export async function listNotifications(userId: string): Promise<{ notifications: NotificationView[]; unread: number }> {
  const [rows, unread] = await Promise.all([notificationsRepository.listFor(userId, LIST_LIMIT), notificationsRepository.countUnread(userId)]);
  return { notifications: rows.map(toNotificationView), unread };
}

export function markRead(userId: string, ids?: string[]): Promise<void> {
  return notificationsRepository.markRead(userId, ids);
}
