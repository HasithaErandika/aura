import { useState } from "react";
import { Outlet, useMatches } from "react-router-dom";
import { Sidebar } from "./Sidebar.tsx";
import { Topbar } from "./Topbar.tsx";

interface RouteHandle {
  title?: string;
  fullBleed?: boolean;
}

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const matches = useMatches();
  const handle = [...matches].reverse().find((m) => m.handle && typeof m.handle === "object")?.handle as RouteHandle | undefined;

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Skip to content
      </a>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={handle?.title ?? "AURA"} onOpenNav={() => setNavOpen(true)} />
        {handle?.fullBleed ? (
          <main id="main" className="min-h-0 flex-1">
            <Outlet />
          </main>
        ) : (
          <main id="main" className="scroll-quiet min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
              <Outlet />
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
