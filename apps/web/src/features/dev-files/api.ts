import { api } from "../../shared/api/client.ts";

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
