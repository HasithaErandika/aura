import { BellIcon, SearchIcon } from "./icons.tsx";
import { useAuth } from "../context/useAuth.ts";

export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { profile } = useAuth();
  const initials = (profile?.fullName ?? profile?.email ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div>
        <p className="text-xs font-medium text-sec-grey">{subtitle ?? "AURA by Dialog"}</p>
        <h1 className="text-lg font-bold tracking-tight text-slate-900">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <label className="relative hidden lg:block">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sec-grey" />
          <input
            type="text"
            placeholder="Search runs, issues, agents…"
            className="w-72 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-sec-grey focus:border-brand-red focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/20"
          />
        </label>

        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-9 items-center justify-center rounded-lg text-sec-grey hover:bg-slate-100 hover:text-slate-700"
        >
          <BellIcon className="size-[18px]" />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-brand-red" />
        </button>

        <div className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3">
          <div className="flex size-7 items-center justify-center rounded-full bg-brand-red text-[11px] font-semibold text-white">
            {initials}
          </div>
          <span className="text-xs font-semibold text-slate-700">{profile?.roleLabel}</span>
        </div>
      </div>
    </header>
  );
}
