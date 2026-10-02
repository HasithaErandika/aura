import { cn } from "../lib/cn.ts";
import { timeAgo } from "../lib/format.ts";
import { MenuItem } from "../ui/Menu.tsx";
import type { AppNotification } from "./notifications.ts";

const DOT: Record<AppNotification["kind"], string> = {
  task_ready: "bg-warning",
  pr_opened: "bg-brand",
  pr_merged: "bg-success",
  ci_passed: "bg-success",
  ci_failed: "bg-danger",
};

export function NotificationItem({ notification: n, onOpen }: { notification: AppNotification; onOpen: () => void }) {
  return (
    <MenuItem onClick={onOpen}>
      <span className={cn("mt-1.5 size-2 shrink-0 self-start rounded-full", n.readAt ? "bg-ink-200" : DOT[n.kind])} aria-hidden />
      <span className="min-w-0 text-left">
        <span className={cn("block truncate text-xs", n.readAt ? "text-ink-600" : "font-semibold text-ink-900")}>{n.title}</span>
        {n.body ? <span className="block truncate text-[11px] text-ink-500">{n.body.split("\n")[0]}</span> : null}
        <span className="block text-[11px] text-ink-400">{timeAgo(n.createdAt)}</span>
      </span>
    </MenuItem>
  );
}
