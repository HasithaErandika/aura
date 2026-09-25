// Response shapes of the apps/api endpoints this client wraps. Kept deliberately narrow - only
// the fields the CLI, web and VS Code extension actually read - and mirrored by hand from
// apps/api (there is no generated schema yet).

export type Role = "admin" | "project_owner" | "business_analyst" | "architect" | "developer" | "qa_engineer" | "deployer";

export interface GitIdentity {
  name: string | null;
  email: string | null;
}

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  roleLabel: string;
  grants: { agents: unknown; approves: string[] };
  gitIdentity: GitIdentity;
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

export interface TaskWorktree {
  taskKey: string;
  epicKey: string;
  discipline: string;
  path: string;
  branch: string;
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

export type RunStatus = "PENDING" | "RUNNING" | "SUSPENDED_FOR_APPROVAL" | "SUCCEEDED" | "FAILED" | "REJECTED" | "EXPIRED" | "HALTED_LOOP_GUARD";

// One Coding Council turn (agent-runtime workflows/coding-council.ts), relayed by the API as
// SSE event "council".
export interface CouncilTurn {
  draftId: string;
  round: number;
  phase: "plan" | "plan-review" | "build" | "checks" | "review" | "fix" | "done";
  role: "planner" | "implementer" | "reviewer" | "system";
  model?: string;
  status: "started" | "done" | "waiting" | "error";
  text?: string;
  verdict?: "APPROVE" | "CHANGES";
  issues?: { file: string; line?: number; severity: string; problem: string; fix: string }[];
  checks?: { id: string; ok: boolean; output: string }[];
  usage?: { totalTokens: number; budget: number };
}

export interface CouncilUsage {
  date: string;
  providers: Record<string, { requests: number; tokens: number; dailyRequestLimit: number | null }>;
}

// Events of a streamed turn (POST /threads/:id/messages, POST /approvals/:id/decide).
export type TurnEvent =
  | { event: "run"; data: { runId: string; runtimeRunId: string | null; status: RunStatus } }
  | { event: "text"; data: { delta: string } }
  | { event: "tool"; data: { phase: "call" | "result" | "error"; toolName: string; toolCallId: string; args?: unknown; result?: unknown; error?: string; agent?: string | null } }
  | { event: "progress"; data: { source?: string; chunk?: string } & Record<string, unknown> }
  | { event: "council"; data: CouncilTurn }
  | { event: "gate"; data: { approvalId: string; runId: string; producingAgent: string | null; gate: { number: number; name: string; outcome: string } | null; question: string; options: AskUserOption[]; snapshot: string | null; canDecide: boolean } }
  | { event: "decision"; data: { approvalId: string; status: ApprovalStatus; decision: Decision } }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: { runId: string; status: RunStatus; approvalId: string | null } };
