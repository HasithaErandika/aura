import { GOVERNANCE } from "../lib/content.ts";
import { LandingSection } from "./LandingSection.tsx";
import { SectionIntro } from "./SectionIntro.tsx";

export function GovernanceSection() {
  return (
    <LandingSection id="governance">
      <SectionIntro title="Governance built in, not bolted on">
        Authorization, approvals and audit are deterministic systems outside the model. Nothing an agent proposes runs without a person and an audit record.
      </SectionIntro>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {GOVERNANCE.map(({ icon: Icon, title, description }) => (
          <div key={title} className="rounded-xl border border-line bg-canvas p-5 shadow-sm">
            <div className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand" aria-hidden>
              <Icon className="size-5" />
            </div>
            <h3 className="mt-3 text-sm font-bold text-ink-900">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">{description}</p>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}
