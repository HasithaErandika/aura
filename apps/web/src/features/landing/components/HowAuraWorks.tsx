import { useState } from "react";
import { LayersIcon } from "@/shared/icons/index.tsx";
import { Tabs } from "@/shared/ui/Tabs.tsx";
import { ArchitectureView } from "./ArchitectureView.tsx";
import { AuthorizationView } from "./AuthorizationView.tsx";
import { LandingSection } from "./LandingSection.tsx";
import { LifecycleView } from "./LifecycleView.tsx";
import { SectionIntro } from "./SectionIntro.tsx";

type View = "lifecycle" | "architecture" | "authorization";

const VIEWS: Array<{ value: View; label: string }> = [
  { value: "lifecycle", label: "Gate lifecycle" },
  { value: "architecture", label: "System layers" },
  { value: "authorization", label: "Authorization" },
];

export function HowAuraWorks() {
  const [view, setView] = useState<View>("lifecycle");
  return (
    <LandingSection id="how-it-works" tone="canvas">
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-xl sm:p-8">
        <SectionIntro
          eyebrow={
            <>
              <LayersIcon className="size-4" aria-hidden />
              How it works
            </>
          }
          title="Agents propose, people decide"
        >
          Three gates and the test plan in the web app, three gates in VS Code, then the release plan.
        </SectionIntro>
        <div className="mt-6">
          <Tabs label="Workflow views" value={view} onChange={setView} items={VIEWS} />
        </div>
        {view === "lifecycle" ? <LifecycleView /> : view === "architecture" ? <ArchitectureView /> : <AuthorizationView />}
      </div>
    </LandingSection>
  );
}
