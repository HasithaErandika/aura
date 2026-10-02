import { Link } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import { LogoMark, LogoWordmark } from "@/shared/brand/Logo.tsx";
import { AuditIcon, GateIcon, TicketIcon } from "@/shared/icons/index.tsx";

const TRUST_POINTS = [
  { icon: GateIcon, text: "A human gate before every consequential action" },
  { icon: TicketIcon, text: "Jira stays the single system of record" },
  { icon: AuditIcon, text: "Full provenance on every artifact an agent creates" },
];

export function BrandPanel() {
  return (
    <div className="hidden flex-col justify-between border-r border-line bg-ink-900 px-12 py-10 text-on-dark lg:flex">
      <Link to={paths.landing} className="flex items-center gap-2.5" aria-label="AURA home">
        <LogoMark className="h-9 w-auto" />
        <LogoWordmark className="text-lg" />
      </Link>
      <div className="max-w-sm">
        <h2 className="text-2xl leading-snug font-bold tracking-tight">AI agents that ship software without going off course.</h2>
        <ul className="mt-8 space-y-4">
          {TRUST_POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-on-dark/10" aria-hidden>
                <Icon className="size-3.5 text-on-dark" />
              </span>
              <span className="text-sm leading-relaxed text-on-dark/80">{text}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs font-medium text-on-dark/50">&copy; {new Date().getFullYear()} AURA, by Dialog.</p>
    </div>
  );
}
