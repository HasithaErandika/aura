import { BoltIcon } from "@/shared/icons/index.tsx";
import { PRINCIPLES } from "../lib/content.ts";
import { LandingSection } from "./LandingSection.tsx";
import { SectionIntro } from "./SectionIntro.tsx";

export function PrinciplesSection() {
  return (
    <LandingSection id="principles">
      <SectionIntro
        eyebrow={
          <>
            <BoltIcon className="size-4 text-brand-orange" aria-hidden />
            Principles
          </>
        }
        title="Five rules AURA never bends"
      >
        Safety comes from the architecture, not from prompts.
      </SectionIntro>
      <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {PRINCIPLES.map((p) => (
          <div key={p.num} className="rounded-xl border border-line bg-canvas p-6 shadow-sm">
            <span className="text-2xl font-black text-brand-orange/40">{p.num}</span>
            <h3 className="mt-2 text-base font-bold text-ink-900">{p.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{p.description}</p>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}
