import { api } from "../../shared/api/client.ts";

export interface QaFile {
  path: string;
  size: number | null;
}

export interface TestRunFailureNote {
  name: string;
  verdict: string;
  note: string;
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
