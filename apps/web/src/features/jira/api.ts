import { api } from "@/shared/api/client.ts";
import type { JiraComment, JiraEpicDetail, JiraIssueDetail, JiraIssueSummary, JiraTransition } from "./types.ts";

const issuePath = (key: string) => `/jira/issues/${encodeURIComponent(key)}`;

export const jiraApi = {
  status: () => api.get<{ configured: boolean }>("/jira/status"),
  epics: (q: string) => api.get<{ epics: JiraIssueSummary[] }>(`/jira/epics${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`).then((r) => r.epics),
  epic: (epicKey: string) => api.get<JiraEpicDetail>(`/jira/epics/${encodeURIComponent(epicKey)}`),
  issue: (key: string) => api.get<{ issue: JiraIssueDetail }>(issuePath(key)).then((r) => r.issue),
  transitions: (key: string) => api.get<{ transitions: JiraTransition[] }>(`${issuePath(key)}/transitions`).then((r) => r.transitions),
  transition: (key: string, transitionId: string) => api.post<{ issue: JiraIssueDetail }>(`${issuePath(key)}/transitions`, { transitionId }).then((r) => r.issue),
  comments: (key: string) => api.get<{ comments: JiraComment[] }>(`${issuePath(key)}/comments`).then((r) => r.comments),
  comment: (key: string, body: string) => api.post<{ comment: JiraComment }>(`${issuePath(key)}/comments`, { body }).then((r) => r.comment),
};
