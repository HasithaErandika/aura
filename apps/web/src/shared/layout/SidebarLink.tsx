import { NavLink } from "react-router-dom";
import { cn } from "../lib/cn.ts";
import type { NavItem } from "./navigation.ts";

export function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const { label, to, icon: Icon, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-300",
          isActive ? "bg-ink-100 text-ink-900" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand" aria-hidden /> : null}
          <Icon className={cn("size-[18px] shrink-0", isActive ? "text-ink-900" : "text-ink-400 group-hover:text-ink-600")} aria-hidden />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}
