import { useState } from "react";
import { Outlet, useMatches } from "react-router-dom";
import { Sidebar } from "./Sidebar.tsx";
import { Topbar } from "./Topbar.tsx";

interface RouteHandle {
  title?: string;
  fullBleed?: boolean;
}

// Authenticated frame: white sidebar, header with the signed-in user, scrolling content.
// Route `handle` supplies the header title; `fullBleed` routes manage their own padding
// (the workspace uses the whole height for the chat panel).
export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const matches = useMatches();
  const handle = [...matches].reverse().find((m) => m.handle && typeof m.handle === "object")?.handle as RouteHandle | undefined;
  const title = handle?.title ?? "AURA";

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} onOpenNav={() => setNavOpen(true)} />
        {handle?.fullBleed ? (
          <main className="min-h-0 flex-1">
            <Outlet />
          </main>
        ) : (
          <main className="scroll-quiet flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
              <Outlet />
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
