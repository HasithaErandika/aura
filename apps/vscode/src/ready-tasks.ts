// Tasks made ready in Jira (roadmap step 3.8) that this VS Code has not offered yet: unread
// task_ready notifications for a Task, each offered once per session.
export function readyOffers<T extends { id: string; kind: string; readAt: string | null; taskKey: string | null }>(notifications: T[], offered: ReadonlySet<string>): (T & { taskKey: string })[] {
  return notifications.filter((n): n is T & { taskKey: string } => n.kind === "task_ready" && !n.readAt && Boolean(n.taskKey) && !offered.has(n.id));
}
