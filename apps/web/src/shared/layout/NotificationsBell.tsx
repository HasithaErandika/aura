import { useNavigate } from "react-router-dom";
import { useAsync } from "../hooks/useAsync.ts";
import { usePolling } from "../hooks/usePolling.ts";
import { Menu, MenuItem, MenuSeparator } from "../ui/Menu.tsx";
import { BellIcon } from "../icons/index.tsx";
import { timeAgo } from "../lib/format.ts";
import { cn } from "../lib/cn.ts";
import { badgeCount, inAppLink } from "./notification-links.ts";
import { notificationsApi, type AppNotification } from "./notifications.ts";

const DOT: Record<AppNotification["kind"], string> = {
  pr_opened: "bg-brand",
  ci_passed: "bg-success",
  ci_failed: "bg-danger",
};

export function NotificationsBell() {
  const navigate = useNavigate();
  const state = useAsync(() => notificationsApi.list(), []);
  usePolling(() => state.reload(), 60_000, true);
  const list = state.data?.notifications ?? [];
  const unread = state.data?.unread ?? 0;

  async function open(n: AppNotification) {
    if (!n.readAt) await notificationsApi.read([n.id]).catch(() => undefined);
    await state.reload();
    const link = inAppLink(n.link);
    if (link) navigate(link);
  }

  async function readAll() {
    await notificationsApi.read().catch(() => undefined);
    await state.reload();
  }

  return (
    <Menu
      trigger={
        <span
          className="relative flex rounded-md p-1.5 text-ink-600 hover:bg-ink-100"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        >
          <BellIcon className="size-5" />
          {unread ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-on-dark">
              {badgeCount(unread)}
            </span>
          ) : null}
        </span>
      }
    >
      <div className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-xs font-semibold text-ink-900">Notifications</p>
          {unread ? (
            <button
              type="button"
              className="text-[11px] text-brand hover:underline"
              onClick={() => void readAll()}
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <MenuSeparator />
        {list.length === 0 ? (
          <p className="px-3 py-4 text-xs text-ink-500">
            Nothing yet. You hear here when a Task's pull request opens and when
            its CI finishes.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {list.map((n) => (
              <MenuItem key={n.id} onClick={() => void open(n)}>
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 self-start rounded-full",
                    n.readAt ? "bg-ink-200" : DOT[n.kind],
                  )}
                />
                <span className="min-w-0 text-left">
                  <span
                    className={cn(
                      "block truncate text-xs",
                      n.readAt ? "text-ink-600" : "font-semibold text-ink-900",
                    )}
                  >
                    {n.title}
                  </span>
                  {n.body ? (
                    <span className="block truncate text-[11px] text-ink-500">
                      {n.body.split("\n")[0]}
                    </span>
                  ) : null}
                  <span className="block text-[11px] text-ink-400">
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
              </MenuItem>
            ))}
          </div>
        )}
      </div>
    </Menu>
  );
}
