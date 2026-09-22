import { api } from "../../shared/api/client.ts";

export interface DevFile {
  path: string;
  size: number;
}

export const scaffoldDisciplines = ["Frontend", "Backend", "Data", "AI", "Integration"] as const;
export type ScaffoldDiscipline = (typeof scaffoldDisciplines)[number];

// Viewer (and, for the Developer role, editor) for a Task's scaffolded directory (Gate 4/5 output).
export const devFilesApi = {
  list: (epicKey: string, discipline: ScaffoldDiscipline) =>
    api.get<{ epicKey: string; discipline: string; files: DevFile[] }>(`/dev-workspace/${encodeURIComponent(epicKey)}/${encodeURIComponent(discipline)}/files`),
  read: (epicKey: string, discipline: ScaffoldDiscipline, path: string) =>
    api.get<{ epicKey: string; discipline: string; path: string; content: string }>(
      `/dev-workspace/${encodeURIComponent(epicKey)}/${encodeURIComponent(discipline)}/file?path=${encodeURIComponent(path)}`,
    ),
  // Developer-role only (enforced server-side); overwrites one existing scaffolded file. No
  // version history - a later delegate_to_code execute against the same Task overwrites it again.
  write: (epicKey: string, discipline: ScaffoldDiscipline, path: string, content: string) =>
    api.put<{ epicKey: string; discipline: string; path: string; content: string }>(
      `/dev-workspace/${encodeURIComponent(epicKey)}/${encodeURIComponent(discipline)}/file`,
      { path, content },
    ),
};
