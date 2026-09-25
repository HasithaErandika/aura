import type { ReactNode } from "react";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { usePolling } from "../../shared/hooks/usePolling.ts";
import { formatDateTime } from "../../shared/lib/format.ts";
import { vscode } from "../../shared/lib/vscodeTheme.ts";
import { qaFilesApi, type TestRun } from "./api.ts";

// The "Test runs" tab: Gate 7's real results - the bounded Tester Agent loop
// (workflows/tester-workflow.ts). The machine result (Playwright's own pass/fail counts) is kept
// visibly separate from the agent's diagnosis and routing, never merged into one claim.
// Scoped to the selected Task when there is one, else the whole Epic. Refreshes every 15s while
// visible, so a run started with "Run tests" shows up here.

const C = { green: "#23d18b", red: "#f14c4c", yellow: "#e5c07b", track: "#2d2d30" };

const VERDICT: Record<string, { label: string; color: string }> = {
  code_bug: { label: "code bug", color: C.red },
  bad_test: { label: "bad test", color: C.yellow },
  unknown: { label: "unknown", color: vscode.mutedText },
};

const ROUTE: Record<string, string> = { dev: "→ Coding Agent fix", qa: "→ QA revised the test", human: "→ escalated to a human", none: "" };

function Pill({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="rounded px-1.5 py-px font-mono text-[10px] font-semibold" style={{ color, backgroundColor: `${color}1f`, border: `1px solid ${color}40` }}>
      {children}
    </span>
  );
}

function ResultBar({ run }: { run: TestRun }) {
  const total = Math.max(1, run.passed + run.failed + run.skipped);
  return (
    <div className="flex h-1.5 w-40 overflow-hidden rounded-full" style={{ backgroundColor: C.track }} title={`${run.passed} passed · ${run.failed} failed · ${run.skipped} skipped`}>
      <div style={{ width: `${(run.passed / total) * 100}%`, backgroundColor: C.green }} />
      <div style={{ width: `${(run.failed / total) * 100}%`, backgroundColor: C.red }} />
    </div>
  );
}

function RunCard({ run }: { run: TestRun }) {
  const ok = !run.halted && run.failed === 0;
  return (
    <div className="rounded-md px-3 py-2.5" style={{ backgroundColor: vscode.sidebarBg, border: `1px solid ${vscode.border}`, boxShadow: `inset 2px 0 0 ${ok ? C.green : C.red}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold" style={{ color: vscode.text }}>
          {run.taskKey}
        </span>
        {run.halted ? <Pill color={C.red}>halted · {run.haltReason === "cap_reached" ? "attempt cap" : "escalated"}</Pill> : <Pill color={ok ? C.green : C.red}>{ok ? "passing" : "failing"}</Pill>}
        <span className="text-[11px]" style={{ color: vscode.mutedText }}>
          {formatDateTime(run.createdAt)} · attempt {run.attempt}
          {run.bugKey ? ` · filed ${run.bugKey}` : ""}
        </span>
        <span className="flex-1" />
        <ResultBar run={run} />
        <span className="font-mono text-[11px] tabular-nums" style={{ color: vscode.text }}>
          <span style={{ color: C.green }}>{run.passed}</span> / <span style={{ color: run.failed ? C.red : vscode.mutedText }}>{run.failed}</span> / <span style={{ color: vscode.mutedText }}>{run.skipped}</span>
        </span>
      </div>

      {run.summary ? (
        <p className="mt-1.5 text-xs" style={{ color: vscode.text }}>
          <span style={{ color: vscode.mutedText }}>Agent: </span>
          {run.summary}
        </p>
      ) : null}

      {run.history.length > 1 ? (
        <ol className="mt-1.5 space-y-0.5 pl-3 text-[11px]" style={{ color: vscode.mutedText, borderLeft: `1px solid ${vscode.border}` }}>
          {run.history.map((a) => (
            <li key={a.attempt}>
              Attempt {a.attempt}: {a.passed} passed, {a.failed} failed{a.commit ? ` · ${a.commit}` : ""} {ROUTE[a.route]}
            </li>
          ))}
        </ol>
      ) : null}

      {run.failureNotes.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {run.failureNotes.map((f, i) => {
            const v = VERDICT[f.verdict] ?? VERDICT.unknown!;
            return (
              <li key={i} className="flex items-start gap-2 text-xs" style={{ color: vscode.text }}>
                <Pill color={v.color}>{v.label}</Pill>
                <span>
                  <span className="font-medium">{f.name}</span>
                  <span style={{ color: vscode.mutedText }}> - {f.note}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function TestRunsPanel({ epicKey, taskKey, tabs }: { epicKey?: string; taskKey?: string; tabs: ReactNode }) {
  const state = useAsync(() => (epicKey ? qaFilesApi.testRuns(epicKey, taskKey) : Promise.resolve(null)), [epicKey, taskKey]);
  usePolling(state.reload, 15_000, Boolean(epicKey));
  const runs = state.data ?? [];
  const failing = runs.filter((r) => r.halted || r.failed > 0).length;

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ backgroundColor: vscode.editorBg, borderTop: `1px solid ${vscode.border}` }}>
      <div className="flex shrink-0 items-center gap-3 px-3 py-1.5" style={{ backgroundColor: vscode.tabBarBg, borderBottom: `1px solid ${vscode.border}` }}>
        {tabs}
        <span className="text-[11px]" style={{ color: vscode.mutedText }}>
          {epicKey ? `${taskKey ?? epicKey} · ${runs.length} run${runs.length === 1 ? "" : "s"}${failing ? ` · ${failing} failing` : ""}` : ""}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => void state.reload()} disabled={!epicKey} className="rounded px-2 py-0.5 text-[11px] hover:bg-white/10 disabled:opacity-40" style={{ color: vscode.text }}>
          Refresh
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {!epicKey ? (
          <p className="text-xs" style={{ color: vscode.mutedText }}>
            Open an Epic to see its test runs.
          </p>
        ) : state.error ? (
          <p className="text-xs" style={{ color: C.red }}>
            {state.error}
          </p>
        ) : state.loading && !state.data ? (
          <div className="h-14 animate-pulse rounded-md" style={{ backgroundColor: vscode.sidebarBg }} />
        ) : runs.length === 0 ? (
          <p className="rounded-md px-3 py-2 text-xs" style={{ color: vscode.mutedText, border: `1px dashed ${vscode.border}` }}>
            No test runs {taskKey ? `for ${taskKey}` : `under ${epicKey}`} yet - Gate 7 results appear here after "Run tests".
          </p>
        ) : (
          runs.map((run) => <RunCard key={run.draftId} run={run} />)
        )}
      </div>
    </div>
  );
}
