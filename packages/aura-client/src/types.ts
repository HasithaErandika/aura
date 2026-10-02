// Response shapes of the apps/api endpoints this client wraps, mirrored by hand.

export type Role = "admin" | "project_owner" | "business_analyst" | "architect" | "developer" | "qa_engineer" | "deployer";

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  roleLabel: string;
  grants: { agents: unknown; approves: string[] };
}

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

export interface ChatToolActivity {
  toolCallId: string;
  toolName: string;
  state: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  tools: ChatToolActivity[];
  createdAt: string | null;
}

export interface RunSummary {
  id: string;
  agentId: string;
  threadId: string;
  status: RunStatus;
  lastError: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ThreadHistory {
  thread: Thread;
  messages: ChatMessage[];
  latestRun: RunSummary | null;
  pendingApproval: Approval | null;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  jiraProjectKey: string;
  repository: { provider: "github" | "local"; owner: string; name: string; fullName: string; defaultBranch: string } | null;
}

export interface BridgeStatus {
  connected: boolean;
  workspace?: string | null;
  client?: string | null;
  since?: string;
}

export interface DeviceSignIn {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface Thread {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED" | "ANSWERED" | "EXPIRED";
export type Decision = "approve" | "reject" | "revise" | "answer";

export interface AskUserOption {
  label: string;
  value?: string;
  description?: string;
}

export interface Approval {
  id: string;
  runId: string;
  threadId: string;
  agentId: string;
  producingAgent: string | null;
  gate: { number: number; name: string; outcome: string } | null;
  requiredRole: Role | null;
  question: string;
  options: AskUserOption[];
  snapshot: string | null;
  snapshotHash: string;
  status: ApprovalStatus;
  requestedAt: string;
  expiresAt: string;
  canDecide?: boolean;
}

export type RunStatus = "PENDING" | "RUNNING" | "SUSPENDED_FOR_APPROVAL" | "SUCCEEDED" | "FAILED" | "REJECTED" | "EXPIRED" | "HALTED_LOOP_GUARD" | "INTERRUPTED";

// Events of a streamed turn (POST /threads/:id/messages, POST /approvals/:id/decide).
export type TurnEvent =
  | { event: "run"; data: { runId: string; runtimeRunId: string | null; status: RunStatus } }
  | { event: "text"; data: { delta: string } }
  | { event: "tool"; data: { phase: "call" | "result" | "error"; toolName: string; toolCallId: string; args?: unknown; result?: unknown; error?: string; agent?: string | null } }
  | { event: "progress"; data: { source?: string; chunk?: string } & Record<string, unknown> }
  | { event: "gate"; data: { approvalId: string; runId: string; producingAgent: string | null; gate: { number: number | null; name: string; outcome: string } | null; question: string; options: AskUserOption[]; snapshot: string | null; canDecide: boolean } }
  | { event: "decision"; data: { approvalId: string; status: ApprovalStatus; decision: Decision } }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: { runId: string; status: RunStatus; approvalId: string | null } };

// A Task's pull request and its CI (apps/api /task-prs, V6).
export interface TaskPr {
  taskKey: string;
  epicKey: string | null;
  repo: string | null;
  branch: string;
  prNumber: number | null;
  prUrl: string | null;
  prTitle: string | null;
  prState: "open" | "merged" | "closed" | null;
  reviewers: string[];
  headSha: string | null;
  ciState: "pending" | "running" | "success" | "failure" | "cancelled" | null;
  ciUrl: string | null;
  ciSummary: { jobs?: { name: string; result: string }[]; tests?: { passed: number; failed: number; skipped: number } };
  ciUpdatedAt: string | null;
  qaState: "pending" | "success" | "failure" | null;
  qaSummary: { required: string[]; passed: string[]; failed: string[]; missing: string[] } | null;
  openedBy: string | null;
  runId: string | null;
  updatedAt: string;
}

export interface AuraNotification {
  id: string;
  kind: "pr_opened" | "pr_merged" | "ci_passed" | "ci_failed";
  title: string;
  body: string;
  link: string | null;
  taskKey: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface TaskDependencies {
  dependencies: { taskKey: string; prState: "open" | "merged" | "closed" | null; merged: boolean }[];
  waitingFor: string[];
}
