import { api } from "../../shared/api/client.ts";

export interface WorkspaceFile {
  path: string;
  size: number | null;
}

export const designDocsApi = {
  listEpics: () => api.get<{ epics: string[] }>(`/workspace`),
  list: (epicKey: string) => api.get<{ epicKey: string; files: WorkspaceFile[] }>(`/workspace/${encodeURIComponent(epicKey)}/files`),
  read: (epicKey: string, path: string) => api.get<{ epicKey: string; path: string; content: string }>(`/workspace/${encodeURIComponent(epicKey)}/file?path=${encodeURIComponent(path)}`),
};
