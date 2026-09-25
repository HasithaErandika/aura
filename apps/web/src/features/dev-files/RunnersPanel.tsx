import { useEffect, useState, type ReactNode } from "react";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { usePolling } from "../../shared/hooks/usePolling.ts";
import { vscode } from "../../shared/lib/vscodeTheme.ts";
import { cn } from "../../shared/lib/cn.ts";
import { runnersApi, type RunnerContainer, type RunnersSnapshot } from "./api.ts";

// The "Runners" tab next to the terminal: everything AURA is running on this machine right now -
// Docker containers (live CPU / memory / PIDs against the fixed per-container limits), host
// capacity, Coding Council runs, project checks running on the host, and terminal sessions.
// Polls every few seconds only while the tab is visible.

const POLL_MS = 5_000;

const C = {
  green: "#23d18b",
  yellow: "#e5c07b",
  red: "#f14c4c",
  blue: "#3b8eea",
  purple: "#c586c0",
  cyan: "#29b8db",
  track: "#2d2d30",
};

const KIND: Record<string, { label: string; color: string }> = {
  "dev-scaffold": { label: "scaffold", color: C.blue },
  code: { label: "coding", color: C.purple },
  test: { label: "test", color: C.yellow },
  ci: { label: "ci", color: C.cyan },
};

function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

function since(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function toneFor(ratio: number): string {
  return ratio >= 0.85 ? C.red : ratio >= 0.6 ? C.yellow : C.green;
}

function Meter({ ratio, label, detail }: { ratio: number | null; label: string; detail: string }) {
  const clamped = ratio === null ? 0 : Math.min(1, Math.max(0, ratio));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[10.5px]" style={{ color: vscode.mutedText }}>
        <span>{label}</span>
        <span className="font-mono tabular-nums" style={{ color: vscode.text }}>
          {detail}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: C.track }}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${clamped * 100}%`, backgroundColor: ratio === null ? "transparent" : toneFor(clamped) }} />
      </div>
    </div>
  );
}

function Tile({ title, value, sub, children, accent }: { title: string; value: ReactNode; sub?: ReactNode; children?: ReactNode; accent?: string }) {
  return (
    <div className="min-w-0 rounded-md px-3 py-2.5" style={{ backgroundColor: vscode.sidebarBg, border: `1px solid ${vscode.border}` }}>
      <p className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: vscode.mutedText }}>
        {title}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold" style={{ color: accent ?? vscode.text }}>
        {value}
      </p>
      {sub ? (
        <p className="truncate text-[11px]" style={{ color: vscode.mutedText }}>
          {sub}
        </p>
      ) : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h4 className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase" style={{ color: vscode.mutedText }}>
        {title}
        <span className="rounded px-1.5 py-px font-mono text-[10px]" style={{ backgroundColor: C.track, color: vscode.text }}>
          {count}
        </span>
      </h4>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md px-3 py-2 text-xs" style={{ color: vscode.mutedText, border: `1px dashed ${vscode.border}` }}>
      {children}
    </p>
  );
}

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-2 shrink-0">
      {pulse ? <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ backgroundColor: color }} /> : null}
      <span className="relative inline-flex size-2 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}

function Chip({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="rounded px-1.5 py-px font-mono text-[10px] font-semibold" style={{ color, backgroundColor: `${color}1f`, border: `1px solid ${color}40` }}>
      {children}
    </span>
  );
}

function ContainerRow({ c, limits }: { c: RunnerContainer; limits: RunnersSnapshot["docker"]["limits"] }) {
  const running = c.state === "running";
  const kind = c.kind ? (KIND[c.kind] ?? { label: c.kind, color: vscode.mutedText }) : null;
  const cpuRatio = c.stats?.cpuPercent != null ? c.stats.cpuPercent / (limits.cpus * 100) : null;
  const memRatio = c.stats?.memoryBytes != null ? c.stats.memoryBytes / limits.memoryBytes : null;
  const pidRatio = c.stats ? c.stats.pids / limits.pids : null;
  return (
    <div className={cn("grid items-center gap-x-4 gap-y-2 rounded-md px-3 py-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]", !running && "opacity-55")} style={{ backgroundColor: vscode.sidebarBg, border: `1px solid ${vscode.border}` }}>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Dot color={running ? C.green : c.state === "exited" ? vscode.mutedText : C.yellow} pulse={running} />
          <span className="truncate font-mono text-xs font-semibold" style={{ color: vscode.text }} title={c.name}>
            {c.name}
          </span>
          {kind ? <Chip color={kind.color}>{kind.label}</Chip> : null}
        </div>
        <p className="mt-0.5 truncate pl-4 text-[11px]" style={{ color: vscode.mutedText }}>
          {[c.taskKey ?? c.epicKey, c.image, c.status].filter(Boolean).join(" · ")}
        </p>
      </div>
      {running && c.stats ? (
        <>
          <Meter ratio={cpuRatio} label="CPU" detail={`${c.stats.cpuPercent?.toFixed(1) ?? "-"}% / ${limits.cpus * 100}%`} />
          <Meter ratio={memRatio} label="Memory" detail={`${formatBytes(c.stats.memoryBytes)} / ${formatBytes(limits.memoryBytes)}`} />
          <Meter ratio={pidRatio} label="Processes" detail={`${c.stats.pids} / ${limits.pids}`} />
        </>
      ) : (
        <p className="text-[11px] lg:col-span-3" style={{ color: vscode.mutedText }}>
          {running ? "live stats unavailable" : `not running - ${c.runningFor}`}
        </p>
      )}
    </div>
  );
}

export function RunnersPanel({ epicKey, active, tabs }: { epicKey?: string; active: boolean; tabs: ReactNode }) {
  const [scope, setScope] = useState<"epic" | "all">(epicKey ? "epic" : "all");
  useEffect(() => setScope(epicKey ? "epic" : "all"), [epicKey]);
  const scopedEpic = scope === "epic" ? epicKey : undefined;

  const state = useAsync(() => (active ? runnersApi.get(scopedEpic) : Promise.resolve(null)), [scopedEpic, active]);
  usePolling(state.reload, POLL_MS, active);
  const [now, setNow] = useState(() => Date.now());
  usePolling(() => setNow(Date.now()), 1000, active);

  const snap = state.data;
  const containers = snap?.docker.containers ?? [];
  const runningCount = containers.filter((c) => c.state === "running").length;
  const memUsed = snap ? snap.host.memoryTotalBytes - snap.host.memoryFreeBytes : 0;
  const load1 = snap?.host.loadAverage[0] ?? 0;
  const busy = runningCount + (snap?.councils.length ?? 0) + (snap?.checks.length ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ backgroundColor: vscode.editorBg, borderTop: `1px solid ${vscode.border}` }}>
      <div className="flex shrink-0 items-center gap-3 px-3 py-1.5" style={{ backgroundColor: vscode.tabBarBg, borderBottom: `1px solid ${vscode.border}` }}>
        {tabs}
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: vscode.mutedText }}>
          <Dot color={busy ? C.green : vscode.mutedText} pulse={busy > 0} />
          {busy ? `${busy} active` : "idle"}
        </span>
        <span className="flex-1" />
        {epicKey ? (
          <div className="flex items-center rounded p-0.5 text-[11px]" style={{ border: `1px solid ${vscode.border}` }}>
            {(["epic", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className="rounded px-2 py-0.5"
                style={scope === s ? { backgroundColor: vscode.selectedBg, color: vscode.selectedText } : { color: vscode.mutedText }}
              >
                {s === "epic" ? epicKey : "All"}
              </button>
            ))}
          </div>
        ) : null}
        <span className="font-mono text-[11px] tabular-nums" style={{ color: vscode.mutedText }}>
          {snap ? `updated ${since(snap.generatedAt, now)} ago` : state.loading ? "loading…" : ""}
        </span>
        <button type="button" onClick={() => void state.reload()} className="rounded px-2 py-0.5 text-[11px] hover:bg-white/10" style={{ color: vscode.text }} title="Refresh now">
          Refresh
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {state.error ? (
          <p className="rounded-md px-3 py-2 text-xs" style={{ color: C.red, border: `1px solid ${C.red}55` }}>
            {state.error}
          </p>
        ) : !snap ? (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-md" style={{ backgroundColor: vscode.sidebarBg }} />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
              <Tile
                title="Docker engine"
                value={snap.docker.available ? `v${snap.docker.version}` : "not running"}
                accent={snap.docker.available ? C.green : C.red}
                sub={snap.docker.available ? `${snap.sandboxMode === "docker" ? "checks run in Docker" : "checks run on host"}` : (snap.docker.error ?? "start Docker for Gates 4/5/7")}
              />
              <Tile title="Containers" value={`${runningCount} running`} sub={`${containers.length} recent · ${scope === "epic" && epicKey ? epicKey : "all Epics"}`} />
              <Tile title="Host CPU" value={`${snap.host.cpus} cores`} sub={`load ${snap.host.loadAverage.map((l) => l.toFixed(2)).join(" · ")}`}>
                <Meter ratio={load1 / snap.host.cpus} label="1-min load" detail={`${Math.round((load1 / snap.host.cpus) * 100)}%`} />
              </Tile>
              <Tile title="Host memory" value={formatBytes(snap.host.memoryTotalBytes)} sub={snap.host.hostname}>
                <Meter ratio={memUsed / snap.host.memoryTotalBytes} label="in use" detail={formatBytes(memUsed)} />
              </Tile>
              <Tile title="Per-container limit" value={`${snap.docker.limits.cpus} CPU · ${formatBytes(snap.docker.limits.memoryBytes)}`} sub={`${snap.docker.limits.pids} processes max`} />
            </div>

            <Section title="Docker containers" count={containers.length}>
              {containers.length === 0 ? (
                <Empty>No AURA containers {scope === "epic" && epicKey ? `for ${epicKey} ` : ""}yet - Gate 4 scaffolds, Claude Code/Codex coding runs, Gate 7 tests and CI runs appear here.</Empty>
              ) : (
                <div className="space-y-1.5">
                  {[...containers]
                    .sort((a, b) => Number(b.state === "running") - Number(a.state === "running"))
                    .map((c) => (
                      <ContainerRow key={c.id} c={c} limits={snap.docker.limits} />
                    ))}
                </div>
              )}
            </Section>

            <Section title="Coding Council" count={snap.councils.length}>
              {snap.councils.length === 0 ? (
                <Empty>No council run in progress.</Empty>
              ) : (
                <div className="space-y-1.5">
                  {snap.councils.map((r) => (
                    <div key={r.draftId} className="grid items-center gap-x-4 gap-y-2 rounded-md px-3 py-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]" style={{ backgroundColor: vscode.sidebarBg, border: `1px solid ${vscode.border}` }}>
                      <div className="flex min-w-0 items-center gap-2">
                        <Dot color={r.status === "waiting" ? C.yellow : r.status === "error" ? C.red : C.purple} pulse={r.status !== "error"} />
                        <span className="font-mono text-xs font-semibold" style={{ color: vscode.text }}>
                          {r.taskKey}
                        </span>
                        <Chip color={C.purple}>{`round ${r.round} · ${r.phase}`}</Chip>
                      </div>
                      <p className="text-[11px]" style={{ color: vscode.mutedText }}>
                        <span className="capitalize" style={{ color: vscode.text }}>
                          {r.role}
                        </span>{" "}
                        {r.status === "waiting" ? "waiting on a rate limit" : r.status === "started" ? "is working" : r.status} · {since(r.startedAt, now)}
                      </p>
                      <Meter ratio={r.totalTokens / r.budget} label="Token budget" detail={`${r.totalTokens.toLocaleString()} / ${r.budget.toLocaleString()}`} />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title={`Project checks (${snap.sandboxMode})`} count={snap.checks.length}>
              {snap.checks.length === 0 ? (
                <Empty>No typecheck / build / test / lint running.</Empty>
              ) : (
                <div className="space-y-1.5">
                  {snap.checks.map((ch) => (
                    <div key={ch.key} className="flex flex-wrap items-center gap-3 rounded-md px-3 py-2" style={{ backgroundColor: vscode.sidebarBg, border: `1px solid ${vscode.border}` }}>
                      <Dot color={C.cyan} pulse />
                      <Chip color={C.cyan}>{ch.id}</Chip>
                      <span className="font-mono text-xs" style={{ color: vscode.text }}>
                        {ch.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]" style={{ color: vscode.mutedText }}>
                        {ch.argv.join(" ")}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums" style={{ color: vscode.mutedText }}>
                        {since(ch.startedAt, now)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Terminal sessions" count={snap.terminals.length}>
              {snap.terminals.length === 0 ? (
                <Empty>No terminal open.</Empty>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {snap.terminals.map((t) => (
                    <span key={t.id} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px]" style={{ backgroundColor: vscode.sidebarBg, border: `1px solid ${vscode.border}`, color: vscode.text }}>
                      <Dot color={t.mine ? C.green : vscode.mutedText} />
                      <span className="font-mono">{t.mine ? (t.label ?? "you") : "another user"}</span>
                      <span style={{ color: vscode.mutedText }}>
                        {t.mode} · {since(t.startedAt, now)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
