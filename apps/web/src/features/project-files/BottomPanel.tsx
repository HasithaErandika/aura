import { useState, type ReactNode } from "react";
import { vscode } from "../../shared/lib/vscodeTheme.ts";
import { PanelTabs } from "./PanelTabs.tsx";
import { TerminalPanel } from "./TerminalPanel.tsx";
import { TestRunsPanel } from "./TestRunsPanel.tsx";
import { RunnersPanel } from "./RunnersPanel.tsx";
import type { PanelTab, ProjectFilesAccess } from "./access.ts";
import type { Location } from "./sources.ts";

// The panel under the editor. Tabs come from the role (access.ts): Terminal (Developer), Test runs
// (roles that see QA), Runners (roles that see code). The terminal stays mounted while another
// tab is shown so switching never drops the shell; the other tabs mount only while visible, so
// they poll only while someone is looking.

function Placeholder({ tabs, children }: { tabs: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: vscode.editorBg, borderTop: `1px solid ${vscode.border}` }}>
      <div className="flex shrink-0 items-center gap-3 px-3 py-1.5" style={{ backgroundColor: vscode.tabBarBg, borderBottom: `1px solid ${vscode.border}` }}>
        {tabs}
      </div>
      <p className="px-4 py-3 font-mono text-xs" style={{ color: vscode.mutedText }}>
        {children}
      </p>
    </div>
  );
}

export function BottomPanel({ access, location, onTerminalOutput }: { access: ProjectFilesAccess; location: Location | null; onTerminalOutput: () => void }) {
  const [active, setActive] = useState<PanelTab>(access.defaultTab ?? access.panelTabs[0]!);
  const tab = access.panelTabs.includes(active) ? active : access.panelTabs[0]!;
  const tabs = <PanelTabs tabs={access.panelTabs} active={tab} onChange={setActive} />;

  return (
    <>
      {access.terminal ? (
        <div className={tab === "terminal" ? "h-full" : "hidden"}>
          {location ? (
            <TerminalPanel epicKey={location.epicKey} discipline={location.discipline} taskKey={location.taskKey} tabs={tabs} onCommandFinished={onTerminalOutput} />
          ) : (
            <Placeholder tabs={tabs}>Open an Epic (and pick a Task) above - a shell opens here in its worktree, with `aura` already signed in.</Placeholder>
          )}
        </div>
      ) : null}
      {tab === "tests" ? <TestRunsPanel epicKey={location?.epicKey} taskKey={location?.taskKey} tabs={tabs} /> : null}
      {tab === "runners" ? <RunnersPanel epicKey={location?.epicKey} active tabs={tabs} /> : null}
    </>
  );
}
