import { LogoMark } from "@/shared/brand/Logo.tsx";

export function LandingFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-ink-500 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <LogoMark className="h-5 w-auto" />
          <span className="font-bold text-ink-900">&copy; {new Date().getFullYear()} AURA</span>
          <span>by Dialog</span>
        </div>
        <p>Jira is the system of record.</p>
      </div>
    </footer>
  );
}
