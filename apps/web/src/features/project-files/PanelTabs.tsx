import { vscode } from "../../shared/lib/vscodeTheme.ts";
import type { PanelTab } from "./access.ts";

// VS Code's bottom-panel tab strip (TERMINAL · TEST RUNS · RUNNERS), rendered inside whichever
// panel is active so the tabs and that panel's own controls share one header row. Which tabs
// exist is decided by the role (access.ts panelTabs).

const LABELS: Record<PanelTab, string> = { terminal: "Terminal", tests: "Test runs", runners: "Runners" };

export function PanelTabs({ tabs, active, onChange }: { tabs: PanelTab[]; active: PanelTab; onChange: (tab: PanelTab) => void }) {
  return (
    <div className="flex items-center gap-3" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={tab === active}
          onClick={() => onChange(tab)}
          className="pb-px text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase transition-colors"
          style={{ color: tab === active ? vscode.text : vscode.mutedText, borderBottom: `1px solid ${tab === active ? vscode.accent : "transparent"}` }}
        >
          {LABELS[tab]}
        </button>
      ))}
    </div>
  );
}
