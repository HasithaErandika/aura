import { useEffect } from "react";
import { env } from "@/config/env.ts";
import { useAuth } from "../auth/useAuth.ts";
import { LogoMark } from "../brand/Logo.tsx";
import { XIcon } from "../icons/index.tsx";
import { cn } from "../lib/cn.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { visibleNavigation } from "./navigation.ts";
import { SidebarLink } from "./SidebarLink.tsx";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!profile) return null;

  return (
    <>
      {open ? <div className="fixed inset-0 z-30 bg-ink-900/30 md:hidden" onClick={onClose} aria-hidden /> : null}
      <aside
        aria-label="Main navigation"
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
          <IconButton label="Close navigation" icon={<XIcon className="size-4" />} onClick={onClose} className="md:hidden" />
        </div>

        <nav className="scroll-quiet flex-1 overflow-y-auto px-3 py-4">
          {visibleNavigation(profile).map((group) => (
            <div key={group.label} className="mb-5">
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-ink-400 uppercase">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <SidebarLink item={item} onNavigate={onClose} />
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
