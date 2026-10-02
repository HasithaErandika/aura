import { api } from "../api/client.ts";

// In-app notifications (apps/api /notifications, V6): a Task's PR opened, its CI passed or failed.

export interface AppNotification {
  id: string;
  kind: "pr_opened" | "ci_passed" | "ci_failed";
  title: string;
  body: string;
  link: string | null;
  taskKey: string | null;
  createdAt: string;
  readAt: string | null;
}

export const notificationsApi = {
  list: () => api.get<{ notifications: AppNotification[]; unread: number }>("/notifications"),
  read: (ids?: string[]) => api.post<{ ok: true }>("/notifications/read", ids ? { ids } : {}),
};
