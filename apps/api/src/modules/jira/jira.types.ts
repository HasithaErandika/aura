// Read-only Jira issue shapes returned by the API. Field selection intentionally small - this
// is a browse/read surface, not a mirror of every Jira field.

export type JiraStatusCategory = "new" | "indeterminate" | "done";

export interface JiraIssueSummary {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  statusCategory: JiraStatusCategory;
  priority: string | null;
  assignee: string | null;
  updated: string | null;
  url: string | null;
}

export interface JiraIssueDetail extends JiraIssueSummary {
  description: string;
  created: string | null;
  reporter: string | null;
}

export interface JiraEpicDetail {
  epic: JiraIssueDetail;
  stories: JiraIssueSummary[];
  tasks: JiraIssueSummary[];
  // Bugs filed under the Epic, kept apart so the UI can show them distinctly.
  bugs: JiraIssueSummary[];
}

// One move available from an issue's current status, per Jira's own workflow.
export interface JiraTransition {
  id: string;
  name: string;
  toStatus: string;
}

// A single comment on an issue - a direct human (or AURA-agent-authored, e.g. provenance
// stamps) comment thread entry, oldest first.
export interface JiraComment {
  id: string;
  author: string | null;
  body: string;
  created: string;
  updated: string | null;
}
