export function inAppLink(link: string | null): string | null {
  return link && /^\/app\/[\w/?=&.%-]*$/.test(link) ? link : null;
}

export function badgeCount(unread: number): string {
  return unread > 9 ? "9+" : String(unread);
}
