import { useNavigate } from "react-router-dom";
import { useAsync } from "../hooks/useAsync.ts";
import { usePolling } from "../hooks/usePolling.ts";
import { BellIcon } from "../icons/index.tsx";
import { Menu, MenuSeparator } from "../ui/Menu.tsx";
import { badgeCount, inAppLink } from "./notification-links.ts";
import { NotificationItem } from "./NotificationItem.tsx";
import { notificationsApi, type AppNotification } from "./notifications.ts";

export function NotificationsBell() {
  const navigate = useNavigate();
  const state = useAsync(() => notificationsApi.list(), []);
  usePolling(state.reload, 60_000, true);
  const list = state.data?.notifications ?? [];
  const unread = state.data?.unread ?? 0;

  async function open(n: AppNotification) {
    if (!n.readAt) await notificationsApi.read([n.id]).catch(() => undefined);
    void state.reload();
    const link = inAppLink(n.link);
    if (link) navigate(link);
  }

  async function readAll() {
    await notificationsApi.read().catch(() => undefined);
    await state.reload();
  }

  return (
    <Menu
      label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      trigger={
        <span className="relative flex rounded-md p-1.5 text-ink-600 hover:bg-ink-100">
          <BellIcon className="size-5" aria-hidden />
          {unread ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-on-dark" aria-hidden>
              {badgeCount(unread)}
            </span>
          ) : null}
        </span>
      }
    >
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-xs font-semibold text-ink-900">Notifications</p>
        {unread ? (
          <button type="button" className="text-[11px] text-brand hover:underline" onClick={() => void readAll()}>
            Mark all read
          </button>
        ) : null}
      </div>
      <MenuSeparator />
      {state.error && !state.data ? (
        <p className="px-3 py-4 text-xs text-danger">{state.error}</p>
      ) : list.length === 0 ? (
        <p className="px-3 py-4 text-xs text-ink-500">Nothing yet. You are told here when a Task's pull request opens and when its CI finishes.</p>
      ) : (
        <div className="scroll-quiet max-h-96 overflow-y-auto">
          {list.map((n) => (
            <NotificationItem key={n.id} notification={n} onOpen={() => void open(n)} />
          ))}
        </div>
      )}
    </Menu>
  );
}
