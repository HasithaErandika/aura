import { ROLES } from "../lib/content.ts";
import { LandingSection } from "./LandingSection.tsx";
import { SectionIntro } from "./SectionIntro.tsx";

export function RolesSection() {
  return (
    <LandingSection id="roles" tone="canvas">
      <SectionIntro title="An agent for every delivery role">
        Each agent is scoped to one discipline, and the people in that role approve its work.
      </SectionIntro>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map(({ label, icon: Icon, gate, scope }) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-canvas text-brand" aria-hidden>
                <Icon className="size-4" />
              </span>
              <span className="rounded-full border border-brand/20 bg-brand-soft px-2.5 py-0.5 text-[10px] font-bold text-brand">{gate}</span>
            </div>
            <h3 className="mt-3 text-sm font-bold text-ink-900">{label}</h3>
            <p className="mt-0.5 text-xs text-ink-500">{scope}</p>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}
