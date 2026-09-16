import type { ComponentType, SVGProps } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  DashboardIcon,
  InboxIcon,
  RunIcon,
  RegistryIcon,
  AuditIcon,
  SettingsIcon,
} from "./icons.tsx";
import { useAuth } from "../context/useAuth.ts";
import { LogoMark } from "./Logo.tsx";

interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: number;
  adminOnly?: boolean;
  /** No dedicated screen yet — links to the dashboard but never shows as "active". */
  stub?: boolean;
}

const navItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: DashboardIcon },
  { label: "Approval Inbox", to: "/dashboard", icon: InboxIcon, badge: 5, stub: true },
  { label: "Run Console", to: "/dashboard", icon: RunIcon, stub: true },
  { label: "Agent Registry", to: "/dashboard", icon: RegistryIcon, stub: true },
  { label: "Audit Explorer", to: "/dashboard", icon: AuditIcon, stub: true },
  { label: "User Management", to: "/admin", icon: SettingsIcon, adminOnly: true },
];

export function Sidebar() {
  const { profile, signOut } = useAuth();
  const initials = (profile?.fullName ?? profile?.email ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-brand-red-dark text-white md:flex">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <div className="flex size-9 items-center justify-center rounded-lg bg-white/10 text-white">
          <LogoMark className="size-5" />
        </div>
        <div>
          <p className="text-base font-bold leading-tight tracking-tight">AURA</p>
          <p className="text-[11px] font-medium text-white/50">by Dialog</p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {navItems
          .filter((item) => !item.adminOnly || profile?.role === "admin")
          .map(({ label, to, icon: Icon, badge, stub }) => {
            const content = (
              <>
                <span className="flex items-center gap-3">
                  <Icon className="size-[18px]" />
                  {label}
                </span>
                {badge ? (
                  <span className="rounded-full bg-prism-gold px-1.5 py-0.5 text-[11px] font-semibold leading-none text-brand-red-dark">
                    {badge}
                  </span>
                ) : null}
              </>
            );

            if (stub) {
              return (
                <Link
                  key={label}
                  to={to}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {content}
                </Link>
              );
            }

            return (
              <NavLink
                key={label}
                to={to}
                className={({ isActive }) =>
                  `flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-brand-red text-white shadow-sm"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                {content}
              </NavLink>
            );
          })}
      </nav>

      <div className="space-y-2 border-t border-white/10 px-3 py-4">
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{profile?.fullName ?? profile?.email}</p>
            <p className="truncate text-[11px] text-white/50">{profile?.roleLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path
              d="M15 17.25 20.25 12 15 6.75M20.25 12H8.75M12.75 6.5V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4.75a2 2 0 0 0 2-2v-1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}
