const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export function formatDateTime(value: string | null | undefined): string {
  const t = toTime(value);
  return t === null ? "" : dateTime.format(t);
}

export function formatDate(value: string | null | undefined): string {
  const t = toTime(value);
  return t === null ? "" : dateOnly.format(t);
}

export function timeAgo(value: string | null | undefined, now = Date.now()): string {
  const then = toTime(value);
  if (then === null) return "";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(value);
}

export function timeUntil(value: string | null | undefined, now = Date.now()): string {
  const then = toTime(value);
  if (then === null) return "";
  const seconds = Math.round((then - now) / 1000);
  if (seconds <= 0) return "expired";
  const hours = Math.floor(seconds / 3600);
  if (hours < 1) return `${Math.max(1, Math.round(seconds / 60))} min left`;
  if (hours < 48) return `${hours} h left`;
  return `${Math.round(hours / 24)} d left`;
}

export function duration(start: string, end: string | null | undefined, now = Date.now()): string {
  const a = toTime(start);
  const b = end ? toTime(end) : now;
  if (a === null || b === null) return "";
  const seconds = Math.max(0, Math.round((b - a) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function initials(name: string | null | undefined, fallback = "?"): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function percent(n: number | null | undefined): string {
  return typeof n === "number" ? `${Math.round(n * 100)}%` : "-";
}

export function personName(person: { fullName: string | null; email: string } | null | undefined, fallback = "Unknown"): string {
  return person ? (person.fullName ?? person.email) : fallback;
}
