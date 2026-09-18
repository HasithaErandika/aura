import { api } from "../../shared/api/client.ts";
import type { JiraEpicDetail, JiraIssueDetail, JiraIssueSummary, JiraTransition } from "../../types/api.ts";

// Reads Jira Epics/Stories/Tasks through apps/api's /jira routes, which fetch Jira directly -
// never through the agent runtime, so browsing Jira never runs an agent (PO or BA included).
export const jiraApi = {
  status: () => api.get<{ configured: boolean }>("/jira/status"),
  epics: (q?: string) => api.get<{ epics: JiraIssueSummary[] }>(`/jira/epics${q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`).then((r) => r.epics),
  epic: (epicKey: string) => api.get<JiraEpicDetail>(`/jira/epics/${encodeURIComponent(epicKey)}`),
  issue: (key: string) => api.get<{ issue: JiraIssueDetail }>(`/jira/issues/${encodeURIComponent(key)}`).then((r) => r.issue),
  transitions: (key: string) => api.get<{ transitions: JiraTransition[] }>(`/jira/issues/${encodeURIComponent(key)}/transitions`).then((r) => r.transitions),
  transition: (key: string, transitionId: string) =>
    api.post<{ issue: JiraIssueDetail }>(`/jira/issues/${encodeURIComponent(key)}/transitions`, { transitionId }).then((r) => r.issue),
};
