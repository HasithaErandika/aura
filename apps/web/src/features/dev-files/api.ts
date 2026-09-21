import { api } from "../../shared/api/client.ts";

export interface DevFile {
  path: string;
  size: number;
}

export const scaffoldDisciplines = ["Frontend", "Backend", "Data", "AI", "Integration"] as const;
export type ScaffoldDiscipline = (typeof scaffoldDisciplines)[number];

// Read-only viewer for a Task's scaffolded directory (Gate 4/5 output) -
// docs/ARCHITECTURE.md section 6.5's "companion read-only viewer" gap.
export const devFilesApi = {
  list: (epicKey: string, discipline: ScaffoldDiscipline) =>
    api.get<{ epicKey: string; discipline: string; files: DevFile[] }>(`/dev-workspace/${encodeURIComponent(epicKey)}/${encodeURIComponent(discipline)}/files`),
  read: (epicKey: string, discipline: ScaffoldDiscipline, path: string) =>
    api.get<{ epicKey: string; discipline: string; path: string; content: string }>(
      `/dev-workspace/${encodeURIComponent(epicKey)}/${encodeURIComponent(discipline)}/file?path=${encodeURIComponent(path)}`,
    ),
};
