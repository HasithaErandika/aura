import { useNavigate } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import { useAuth } from "../auth/useAuth.ts";
import { ChevronDownIcon, LogoutIcon } from "../icons/index.tsx";
import { initials } from "../lib/format.ts";
import { Badge } from "../ui/Badge.tsx";
import { Menu, MenuItem, MenuSeparator } from "../ui/Menu.tsx";

export function UserMenu() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  if (!profile) return null;
  const name = profile.fullName ?? profile.email;

  async function handleSignOut() {
    await signOut();
    navigate(paths.login, { replace: true });
  }

  return (
    <Menu
      label={`Account menu for ${name}`}
      trigger={
        <span className="flex items-center gap-2.5 rounded-md border border-line py-1 pr-2 pl-1 hover:bg-ink-50">
          <span className="flex size-7 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-on-dark" aria-hidden>
            {initials(name)}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block max-w-[160px] truncate text-xs font-semibold text-ink-900">{name}</span>
            <span className="block text-[11px] text-ink-500">{profile.roleLabel}</span>
          </span>
          <ChevronDownIcon className="size-4 text-ink-400" aria-hidden />
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
        <LogoutIcon className="size-4" aria-hidden />
        Sign out
      </MenuItem>
    </Menu>
  );
}
