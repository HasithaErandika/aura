import type { Role } from "../shared/lib/roles.ts";

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
  | "HALTED_LOOP_GUARD";

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
  | { event: "progress"; data: { stepId?: string; phase?: string; status?: string } }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: { runId: string; status: RunStatus; approvalId: string | null } };
