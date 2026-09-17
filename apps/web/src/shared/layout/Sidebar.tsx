import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/useAuth.ts";
import { navigation } from "./navigation.ts";
import { LogoMark } from "../brand/Logo.tsx";
import { cn } from "../lib/cn.ts";
import { XIcon } from "../icons/index.tsx";
import { env } from "../../config/env.ts";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();
  if (!profile) return null;

  const groups = navigation
    .map((group) => ({ ...group, items: group.items.filter((item) => item.visible(profile)) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {open ? <div className="fixed inset-0 z-30 bg-ink-900/30 md:hidden" onClick={onClose} aria-hidden /> : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-line bg-surface transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-auto" />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-ink-900">AURA</p>
              <p className="text-[11px] text-ink-500">Delivery platform</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 md:hidden" aria-label="Close navigation">
            <XIcon className="size-4" />
          </button>
        </div>

        <nav className="scroll-quiet flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map(({ label, to, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          isActive ? "bg-ink-100 text-ink-900" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" /> : null}
                          <Icon className={cn("size-[18px] shrink-0", isActive ? "text-ink-900" : "text-ink-400 group-hover:text-ink-600")} />
                          <span className="truncate">{label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[11px] text-ink-400">
          <span>AURA by Dialog</span>
          <span className="font-mono">v{env.appVersion}</span>
        </div>
      </aside>
    </>
  );
}
