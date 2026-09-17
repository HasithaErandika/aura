import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth.ts";
import { Menu, MenuItem, MenuSeparator } from "../ui/Menu.tsx";
import { Badge } from "../ui/Badge.tsx";
import { initials } from "../lib/format.ts";
import { ChevronDownIcon, LogoutIcon, MenuIcon } from "../icons/index.tsx";
import { RuntimeStatus } from "./RuntimeStatus.tsx";
import { paths } from "../../app/paths.ts";

export function Topbar({ title, onOpenNav }: { title: string; onOpenNav: () => void }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  if (!profile) return null;

  async function handleSignOut() {
    await signOut();
    navigate(paths.login, { replace: true });
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onOpenNav} className="rounded-md p-1.5 text-ink-600 hover:bg-ink-100 md:hidden" aria-label="Open navigation">
          <MenuIcon className="size-5" />
        </button>
        <h1 className="truncate text-sm font-semibold text-ink-900">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <RuntimeStatus />
        <Menu
          trigger={
            <span className="flex items-center gap-2.5 rounded-md border border-line py-1 pl-1 pr-2 hover:bg-ink-50">
              <span className="flex size-7 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-on-dark">
                {initials(profile.fullName ?? profile.email)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block max-w-[160px] truncate text-xs font-semibold text-ink-900">{profile.fullName ?? profile.email}</span>
                <span className="block text-[11px] text-ink-500">{profile.roleLabel}</span>
              </span>
              <ChevronDownIcon className="size-4 text-ink-400" />
            </span>
          }
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-ink-900">{profile.fullName ?? "Unnamed user"}</p>
            <p className="truncate text-xs text-ink-500">{profile.email}</p>
            <div className="mt-2">
              <Badge tone="outline">{profile.roleLabel}</Badge>
            </div>
          </div>
          <MenuSeparator />
          <MenuItem onClick={() => void handleSignOut()} danger>
            <LogoutIcon className="size-4" />
            Sign out
          </MenuItem>
        </Menu>
      </div>
    </header>
  );
}
