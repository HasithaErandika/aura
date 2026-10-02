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
  bugs: JiraIssueSummary[];
}

export interface JiraTransition {
  id: string;
  name: string;
  toStatus: string;
}

export interface JiraComment {
  id: string;
  author: string | null;
  body: string;
  created: string;
  updated: string | null;
}
