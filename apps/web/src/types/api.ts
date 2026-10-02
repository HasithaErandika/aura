import type { CouncilTurnEvent } from "../shared/lib/council.ts";
import type { Role } from "../shared/lib/roles.ts";
import type { GatewayEvent } from "../shared/lib/gateway.ts";

export type AgentAccess = "run" | "read";

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  roleLabel: string;
  grants: { agents: Record<string, AgentAccess>; approves: string[] };
}

export type RunStatus =
  | "PENDING"
  | "RUNNING"
  | "SUSPENDED_FOR_APPROVAL"
  | "SUCCEEDED"
  | "FAILED"
  | "REJECTED"
  | "EXPIRED"
  | "HALTED_LOOP_GUARD"
  | "INTERRUPTED";

export interface Person {
  fullName: string | null;
  email: string;
}

export interface Run {
  id: string;
  agentId: string;
  threadId: string;
  runtimeRunId: string | null;
  requestedBy: string;
  requestedByRole: Role;
  requester?: Person | null;
  status: RunStatus;
  currentAgent: string | null;
  agentsInvolved: string[];
  title: string | null;
  inputSummary: string | null;
  outputSummary: string | null;
  lastError: string | null;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
}

export type RunStepKind = "tool-call" | "tool-result" | "tool-error" | "text" | "suspended" | "resumed" | "error" | "finish" | "progress";

export interface RunStep {
  id: number;
  seq: number;
  kind: RunStepKind;
  toolName: string | null;
  toolCallId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED" | "ANSWERED" | "EXPIRED";
export type Decision = "approve" | "reject" | "revise" | "answer";

export interface AskUserOption {
  label: string;
  value?: string;
  description?: string;
}

export interface GateInfo {
  number: number;
  name: string;
  outcome: string;
}

export interface DecisionRecord {
  id: string;
  decidedBy: string;
  decidedByRole: Role;
  decision: Decision;
  answer: string | null;
  reason: string | null;
  createdAt: string;
}

export interface Approval {
  id: string;
  runId: string;
  threadId: string;
  agentId: string;
  producingAgent: string | null;
  gate: GateInfo | null;
  requiredRole: Role | null;
  requestedBy: string;
  requester?: Person | null;
  question: string;
  options: AskUserOption[];
  selectionMode: "single_select" | "multi_select" | null;
  snapshot: string | null;
  snapshotHash: string;
  status: ApprovalStatus;
  requestedAt: string;
  expiresAt: string;
  decidedAt: string | null;
  decision?: DecisionRecord | null;
  canDecide?: boolean;
}

export interface AgentTool {
  id: string;
  description: string | null;
}

export interface RegistryAgent {
  id: string;
  name: string;
  description: string | null;
  model: string | null;
  supportsMemory: boolean;
  maxSteps: number | null;
  tools: AgentTool[];
  suggestedPrompts: string[];
  access: AgentAccess | null;
  approverRole: Role | null;
  gate: { gate: number; name: string; outcome: string } | null;
  grants: { run: Role[]; read: Role[] };
}

export interface Thread {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
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

export interface ThreadHistory {
  thread: Thread;
  messages: ChatMessage[];
  latestRun: Run | null;
  pendingApproval: Approval | null;
}

export interface AuditEntry {
  id: number;
  actorId: string | null;
  actorRole: Role | null;
  actor: Person | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: string;
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

export interface RuntimeHealth {
  ok: boolean;
  agents: string[];
  message?: string;
}

export interface DashboardSummary {
  role: Role;
  grants: { agents: Record<string, AgentAccess>; approves: string[] };
  counts: {
    pendingForMyRole: number;
    pendingOnMyRuns: number;
    activeRuns: number;
    suspendedRuns: number;
    succeededRuns: number;
    failedRuns: number;
    rejectedRuns: number;
  };
  needsDecision: Approval[];
  recentRuns: Run[];
  runtime: RuntimeHealth;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role | null;
  roleLabel: string | null;
  lastSignInAt: string | null;
  createdAt: string;
}

// GET /dashboard/token-usage (admin): the runtime's token ledger.
export interface TokenUsageReport {
  since: string;
  days: number;
  totals: { calls: number; input: number; output: number; reasoning: number; cached: number };
  agents: { agent: string; calls: number; input: number; output: number; reasoning: number; cached: number; avgInput: number; avgOutput: number; share: number }[];
  models: { model: string; calls: number; input: number; output: number }[];
  contextSaved: { chars: number; approxTokens: number };
}

// GET /dashboard/agent-quality (admin): how humans decided on each agent's gates.
export interface AgentQualityRow {
  agent: string;
  gates: number;
  decided: number;
  approve: number;
  revise: number;
  reject: number;
  answer: number;
  expired: number;
  pending: number;
  approvalRate: number | null;
  firstPassRate: number | null;
  medianDecisionMinutes: number | null;
}

// GET /projects (apps/api modules/projects). One repository per Project in Phase 1.
export type RepositoryProvider = "github" | "local";

export interface Repository {
  id: string;
  provider: RepositoryProvider;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  installationId: number | null;
  createdAt: string;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  jiraProjectKey: string;
  createdAt: string;
  repository: Repository | null;
}

// Events on the SSE stream from POST /threads/:id/messages and POST /approvals/:id/decide.
export type StreamEvent =
  | { event: "run"; data: { runId: string; runtimeRunId: string | null; status: RunStatus } }
  | { event: "text"; data: { delta: string } }
  | {
      event: "tool";
      data: { phase: "call" | "result" | "error"; toolName: string; toolCallId: string; args?: unknown; result?: unknown; error?: string; agent?: string | null };
    }
  | {
      event: "gate";
      data: {
        approvalId: string;
        runId: string;
        producingAgent: string | null;
        gate: GateInfo | null;
        requiredRole: Role | null;
        question: string;
        options: AskUserOption[];
        selectionMode: "single_select" | "multi_select" | null;
        snapshot: string | null;
        expiresAt: string;
        canDecide: boolean;
      };
    }
  | { event: "decision"; data: { approvalId: string; status: ApprovalStatus; decision: Decision } }
  | { event: "progress"; data: { stepId?: string; phase?: string; status?: string; source?: "dev" | "code" | "gateway"; chunk?: string } & GatewayEvent }
  | { event: "council"; data: CouncilTurnEvent }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: { runId: string; status: RunStatus; approvalId: string | null } };
