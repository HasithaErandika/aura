// Pure helpers for the notification bell (NotificationsBell.tsx).

// Only links inside the app are followed; anything else is ignored.
export function inAppLink(link: string | null): string | null {
  return link && /^\/app\/[\w/?=&.%-]*$/.test(link) ? link : null;
}

export function badgeCount(unread: number): string {
  return unread > 9 ? "9+" : String(unread);
}
