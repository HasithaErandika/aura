import { api } from "../../shared/api/client.ts";
import type { Tone } from "../../shared/ui/Badge.tsx";

// Every API Project Files talks to: the Epic's design documents (Architect workspace), its QA
// workspace and test-run history, a Task's code (dev workspace), the web terminal ticket, and the
// Runners snapshot. Each section below is served by its own apps/api module with its own policy
// check - see access.ts for how the page mirrors them.

// ---- Code (Gate 4/5 dev workspace) ----
export interface DevFile {
  path: string;
  size: number;
}

export const scaffoldDisciplines = ["Frontend", "Backend", "Data", "AI", "Integration"] as const;
export type ScaffoldDiscipline = (typeof scaffoldDisciplines)[number];

// Viewer (and, for the Developer role, editor) for a Task's own isolated git worktree, or the
// shared base scaffold if no taskKey is given ("Concurrent Task Execution" milestone - once a
// discipline is scaffolded, real per-Task code lives in worktrees, not the shared directory).
export const devFilesApi = {
  list: (epicKey: string, discipline: ScaffoldDiscipline, taskKey?: string) =>
    api.get<{ epicKey: string; discipline: string; files: DevFile[] }>(
      `/dev-workspace/${encodeURIComponent(epicKey)}/${encodeURIComponent(discipline)}/files${taskKey ? `?taskKey=${encodeURIComponent(taskKey)}` : ""}`,
    ),
  read: (epicKey: string, discipline: ScaffoldDiscipline, path: string, taskKey?: string) =>
    api.get<{ epicKey: string; discipline: string; path: string; content: string }>(
      `/dev-workspace/${encodeURIComponent(epicKey)}/${encodeURIComponent(discipline)}/file?path=${encodeURIComponent(path)}${taskKey ? `&taskKey=${encodeURIComponent(taskKey)}` : ""}`,
    ),
  // Developer-role only (enforced server-side); overwrites one existing file. No version
  // history - a later delegate_to_code execute against the same Task overwrites it again.
  write: (epicKey: string, discipline: ScaffoldDiscipline, path: string, content: string, taskKey?: string) =>
    api.put<{ epicKey: string; discipline: string; path: string; content: string }>(
      `/dev-workspace/${encodeURIComponent(epicKey)}/${encodeURIComponent(discipline)}/file`,
      { path, content, taskKey },
    ),
};

// A short-lived, single-use ticket for the web terminal (apps/api modules/terminal) - the
// browser opens `${url}?ticket=...` on apps/agent-runtime's terminal WebSocket with it.
export const terminalApi = {
  ticket: (epicKey: string, discipline: ScaffoldDiscipline, taskKey?: string) =>
    api.post<{ url: string; ticket: string; expiresAt: string }>("/terminal/tickets", { epicKey, discipline, ...(taskKey ? { taskKey } : {}) }),
};

// What AURA is running right now (apps/api modules/runners, agent-runtime server/runners-routes.ts).
export interface RunnerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  runningFor: string;
  createdAt: string;
  kind: string | null;
  epicKey: string | null;
  taskKey: string | null;
  stats: { cpuPercent: number | null; memoryBytes: number | null; memoryPercent: number | null; pids: number; netIO: string; blockIO: string } | null;
}

interface Located {
  epicKey: string | null;
  discipline: string | null;
  taskKey: string | null;
  label: string;
}

export interface RunnersSnapshot {
  generatedAt: string;
  epicKey: string | null;
  host: { hostname: string; platform: string; cpus: number; loadAverage: number[]; memoryTotalBytes: number; memoryFreeBytes: number; uptimeSeconds: number };
  docker: {
    available: boolean;
    version: string | null;
    error: string | null;
    limits: { cpus: number; memoryBytes: number; pids: number };
    containers: RunnerContainer[];
  };
  sandboxMode: "host" | "docker";
  councils: (Located & { draftId: string; round: number; phase: string; role: string; status: string; totalTokens: number; budget: number; startedAt: string })[];
  checks: (Located & { key: string; id: string; argv: string[]; mode: "host" | "docker"; startedAt: string })[];
  terminals: { id: number; mine: boolean; label: string | null; mode: string; startedAt: string }[];
}

export const runnersApi = {
  get: (epicKey?: string) => api.get<RunnersSnapshot>(`/runners${epicKey ? `?epic=${encodeURIComponent(epicKey)}` : ""}`),
};

// ---- Design documents (Gate 3 Architect workspace) ----
export interface WorkspaceFile {
  path: string;
  size: number | null;
}

export const designDocsApi = {
  listEpics: () => api.get<{ epics: string[] }>(`/workspace`),
  list: (epicKey: string) => api.get<{ epicKey: string; files: WorkspaceFile[] }>(`/workspace/${encodeURIComponent(epicKey)}/files`),
  read: (epicKey: string, path: string) => api.get<{ epicKey: string; path: string; content: string }>(`/workspace/${encodeURIComponent(epicKey)}/file?path=${encodeURIComponent(path)}`),
  // Architect-role only (enforced server-side); overwrites one existing document. No version
  // history - a later agent revise (Gate 3 `file` mode) will overwrite it again from the draft.
  write: (epicKey: string, path: string, content: string) =>
    api.put<{ epicKey: string; path: string; content: string }>(`/workspace/${encodeURIComponent(epicKey)}/file`, { path, content }),
  // Which Orchestrator thread last drafted this Epic's architecture - lets "send feedback to
  // the Architect" continue that conversation (and its draftId) instead of starting a fresh one.
  thread: (epicKey: string) => api.get<{ epicKey: string; threadId: string | null }>(`/workspace/${encodeURIComponent(epicKey)}/thread`),
};


// Classifies a workspace file path into the kind of document the Architect Workflow produces
// (workflows/architect-workflow.ts + delegate-tools.ts's `file` mode), for a label and icon a
// reader can scan at a glance instead of parsing the raw path.
export function classifyWorkspaceFile(path: string): { label: string; tone: Tone; kind: "architecture" | "plan" | "requirements" | "adr" | "doc" } {
  if (path === "architecture.md") return { label: "Architecture", tone: "brand", kind: "architecture" };
  if (path === "plan.md") return { label: "Plan", tone: "success", kind: "plan" };
  if (path.startsWith("docs/srs/")) return { label: "Requirements", tone: "warning", kind: "requirements" };
  if (path.startsWith("docs/adr/")) return { label: "ADR", tone: "outline", kind: "adr" };
  return { label: "Doc", tone: "neutral", kind: "doc" };
}

export function workspaceFileTitle(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/\.md$/, "").replace(/^\d+-/, "").replace(/-/g, " ");
}

// A fixed, sensible reading order (architecture/plan/requirements first, ADRs after) rather
// than plain alphabetical, which would separate architecture.md from its companions.
export function sortedWorkspaceFiles(files: WorkspaceFile[]): WorkspaceFile[] {
  const rank = (p: string) => (p === "architecture.md" ? 0 : p === "plan.md" ? 1 : p.startsWith("docs/srs/") ? 2 : p.startsWith("docs/adr/") ? 3 : 4);
  return [...files].sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
}

// ---- QA workspace (Gate 6) and test runs (Gate 7) ----
export interface QaFile {
  path: string;
  size: number | null;
}

export interface TestRunFailureNote {
  name: string;
  verdict: string;
  note: string;
}

export interface TestRunAttempt {
  attempt: number;
  commit: string | null;
  passed: number;
  failed: number;
  skipped: number;
  diagnoses: { name: string; stage: string; classification: "code_bug" | "bad_test" | "unknown"; confidence: "low" | "medium" | "high"; reasoning: string }[];
  route: "dev" | "qa" | "human" | "none";
  action: string;
}

export interface TestRun {
  draftId: string;
  taskKey: string;
  discipline: string;
  createdAt: string;
  passed: number;
  failed: number;
  skipped: number;
  summary: string | null;
  failureNotes: TestRunFailureNote[];
  // The Tester Agent loop (workflows/tester-workflow.ts): how many test/diagnose/route attempts
  // this run took, whether it stopped without passing (HALTED_LOOP_GUARD), the Bug it auto-filed
  // (if any), and the full per-attempt trail.
  attempt: number;
  halted: boolean;
  haltReason: "cap_reached" | "escalated_unknown" | null;
  bugKey: string | null;
  history: TestRunAttempt[];
}

// Read-only viewer for Gate 6's test plan + Playwright source, and Gate 7's real test-run
// history - apps/agent-runtime's qa-workspace-routes.ts and test-runs-routes.ts.
export const qaFilesApi = {
  listEpics: () => api.get<{ epics: string[] }>(`/qa-workspace`),
  list: (epicKey: string) => api.get<{ epicKey: string; files: QaFile[] }>(`/qa-workspace/${encodeURIComponent(epicKey)}/files`),
  read: (epicKey: string, path: string) => api.get<{ epicKey: string; path: string; content: string }>(`/qa-workspace/${encodeURIComponent(epicKey)}/file?path=${encodeURIComponent(path)}`),
  // QA Engineer-role only (enforced server-side); overwrites one existing test-plan/spec file. No
  // version history - a later delegate_to_qa revise+file for the same Epic overwrites it again.
  write: (epicKey: string, path: string, content: string) =>
    api.put<{ epicKey: string; path: string; content: string }>(`/qa-workspace/${encodeURIComponent(epicKey)}/file`, { path, content }),
  testRuns: (epicKey: string, taskKey?: string) =>
    api
      .get<{ epicKey: string; runs: TestRun[] }>(`/test-runs/${encodeURIComponent(epicKey)}${taskKey ? `?taskKey=${encodeURIComponent(taskKey)}` : ""}`)
      .then((r) => r.runs),
};

export function classifyQaFile(path: string): { label: string; tone: "brand" | "outline" } {
  return path === "test-plan.md" ? { label: "Test Plan", tone: "brand" } : { label: "Spec", tone: "outline" };
}
