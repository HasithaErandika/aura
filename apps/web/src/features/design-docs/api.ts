import { api } from "../../shared/api/client.ts";
import type { DesignDoc, DocEpic, DocKind, DocVersion } from "./docs.ts";

export * from "./docs.ts";

// Every save is a new version; nothing is overwritten.

const kindQuery = (kinds: DocKind[]) => `kind=${encodeURIComponent(kinds.join(","))}`;

export const designDocsApi = {
  epics: (kinds: DocKind[]) => api.get<{ epics: DocEpic[]; editableKinds: DocKind[] }>(`/design-docs/epics?${kindQuery(kinds)}`),
  list: (epicKey: string, kinds: DocKind[]) =>
    api.get<{ documents: DesignDoc[]; editableKinds: DocKind[] }>(`/design-docs?epicKey=${encodeURIComponent(epicKey)}&${kindQuery(kinds)}`),
  get: (id: string) => api.get<{ document: DesignDoc; content: string; versions: DocVersion[] }>(`/design-docs/${id}`),
  version: (id: string, version: number) => api.get<{ document: DesignDoc; version: DocVersion; content: string }>(`/design-docs/${id}/versions/${version}`),
  create: (input: { epicKey: string; kind: DocKind; title: string; content: string; issueKey?: string }) => api.post<{ document: DesignDoc }>("/design-docs", input),
  save: (id: string, input: { content: string; baseVersion: number; note?: string; title?: string }) =>
    api.put<{ document: DesignDoc; changed: boolean }>(`/design-docs/${id}`, input),
};
