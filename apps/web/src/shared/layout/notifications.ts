import { api } from "../api/client.ts";

export interface AppNotification {
  id: string;
  kind: "pr_opened" | "pr_merged" | "ci_passed" | "ci_failed";
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
