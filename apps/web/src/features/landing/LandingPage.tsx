import { CtaSection } from "./components/CtaSection.tsx";
import { GovernanceSection } from "./components/GovernanceSection.tsx";
import { Hero } from "./components/Hero.tsx";
import { HowAuraWorks } from "./components/HowAuraWorks.tsx";
import { LandingFooter } from "./components/LandingFooter.tsx";
import { LandingHeader } from "./components/LandingHeader.tsx";
import { PrinciplesSection } from "./components/PrinciplesSection.tsx";
import { RolesSection } from "./components/RolesSection.tsx";

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas font-sans text-ink-900 selection:bg-brand selection:text-on-dark">
      <LandingHeader />
      <main>
        <Hero />
        <HowAuraWorks />
        <PrinciplesSection />
        <GovernanceSection />
        <RolesSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
