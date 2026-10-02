import { api } from "@/shared/api/client.ts";
import type { DesignDoc, DocDetail, DocEpic, DocKind, DocVersion, TaskPr } from "./types.ts";

const kindQuery = (kinds: DocKind[]) => `kind=${encodeURIComponent(kinds.join(","))}`;

export const designDocsApi = {
  epics: (kinds: DocKind[]) => api.get<{ epics: DocEpic[]; editableKinds: DocKind[] }>(`/design-docs/epics?${kindQuery(kinds)}`),
  list: (epicKey: string, kinds: DocKind[]) => api.get<{ documents: DesignDoc[]; editableKinds: DocKind[] }>(`/design-docs?epicKey=${encodeURIComponent(epicKey)}&${kindQuery(kinds)}`),
  get: (id: string) => api.get<DocDetail>(`/design-docs/${id}`),
  version: (id: string, version: number) => api.get<{ document: DesignDoc; version: DocVersion; content: string }>(`/design-docs/${id}/versions/${version}`),
  create: (input: { epicKey: string; kind: DocKind; title: string; content: string }) => api.post<{ document: DesignDoc }>("/design-docs", input).then((r) => r.document),
  save: (id: string, input: { content: string; baseVersion: number; note?: string }) => api.put<{ document: DesignDoc; changed: boolean }>(`/design-docs/${id}`, input),
};

export const taskPrsApi = {
  list: (epicKey: string | null) => api.get<{ taskPrs: TaskPr[] }>(`/task-prs${epicKey ? `?epicKey=${encodeURIComponent(epicKey)}` : ""}`).then((r) => r.taskPrs),
};
