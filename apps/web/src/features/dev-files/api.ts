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
