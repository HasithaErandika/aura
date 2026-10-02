import { MenuIcon } from "../icons/index.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { NotificationsBell } from "./NotificationsBell.tsx";
import { RuntimeStatus } from "./RuntimeStatus.tsx";
import { UserMenu } from "./UserMenu.tsx";

export function Topbar({ title, onOpenNav }: { title: string; onOpenNav: () => void }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton label="Open navigation" icon={<MenuIcon className="size-5" />} onClick={onOpenNav} className="text-ink-600 md:hidden" />
        <p className="truncate text-sm font-semibold text-ink-900">{title}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <RuntimeStatus />
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  );
}
