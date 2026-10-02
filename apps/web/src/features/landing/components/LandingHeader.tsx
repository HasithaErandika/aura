import { Link } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import { LogoMark, LogoWordmarkImage } from "@/shared/brand/Logo.tsx";
import { buttonClass } from "@/shared/ui/buttonStyles.ts";

const LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#principles", label: "Principles" },
  { href: "#governance", label: "Governance" },
  { href: "#roles", label: "Roles" },
];

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link to={paths.landing} className="flex items-center gap-2.5" aria-label="AURA home">
          <LogoMark className="h-7 w-auto" />
          <LogoWordmarkImage className="h-5 w-auto" />
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Sections">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-xs font-semibold tracking-wider text-ink-600 uppercase transition-colors hover:text-brand">
              {l.label}
            </a>
          ))}
        </nav>
        <Link to={paths.login} className={buttonClass("primary", "sm")}>
          Sign in
        </Link>
      </div>
    </header>
  );
}
