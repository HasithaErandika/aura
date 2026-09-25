import { api } from "../../shared/api/client.ts";
import type { Tone } from "../../shared/ui/Badge.tsx";

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

// Shared with the Jira page's embedded Documents section and Project Files, so both classify and order
// a design workspace's files identically.

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
