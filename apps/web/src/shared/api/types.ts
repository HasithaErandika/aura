import type { Role } from "../lib/roles.ts";
import type { GatewayEvent } from "../lib/gateway.ts";

export type AgentAccess = "run" | "read";

export interface Grants {
  agents: Record<string, AgentAccess>;
  approves: string[];
}

export interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  roleLabel: string;
  grants: Grants;
}

export interface Person {
  fullName: string | null;
  email: string;
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

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED" | "ANSWERED" | "EXPIRED";
export type Decision = "approve" | "reject" | "revise" | "answer";

export interface DecisionInput {
  decision: Decision;
  answer?: string;
  reason?: string;
}

export interface AskUserOption {
  label: string;
  value?: string;
  description?: string;
}

export interface GateInfo {
  number: number | null;
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

export interface PendingGate {
  approvalId: string;
  runId: string;
  producingAgent: string | null;
  gate: GateInfo | null;
  requiredRole: Role | null;
  question: string;
  options: AskUserOption[];
  selectionMode: "single_select" | "multi_select" | null;
  snapshot: string | null;
  snapshotHash: string | null;
  expiresAt: string;
  canDecide: boolean;
}

export interface ToolActivityItem {
  toolCallId: string;
  toolName: string;
  state: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
}

export interface RuntimeHealth {
  ok: boolean;
  agents: string[];
  message?: string;
}

export interface RegistryAgent {
  id: string;
  name: string;
  description: string | null;
  model: string | null;
  supportsMemory: boolean;
  maxSteps: number | null;
  tools: Array<{ id: string; description: string | null }>;
  suggestedPrompts: string[];
  access: AgentAccess | null;
  approverRole: Role | null;
  gate: { gate: number | null; name: string; outcome: string } | null;
  grants: { run: Role[]; read: Role[] };
}

export type ProgressData = { stepId?: string; phase?: string; status?: string; source?: "gateway" | "task"; kind?: string } & Omit<GatewayEvent, "source">;

export type StreamEvent =
  | { event: "run"; data: { runId: string; runtimeRunId: string | null; status: RunStatus } }
  | { event: "text"; data: { delta: string } }
  | {
      event: "tool";
      data: { phase: "call" | "result" | "error"; toolName: string; toolCallId: string; args?: unknown; result?: unknown; error?: string; agent?: string | null };
    }
  | { event: "gate"; data: Omit<PendingGate, "snapshotHash"> }
  | { event: "decision"; data: { approvalId: string; status: ApprovalStatus; decision: Decision } }
  | { event: "progress"; data: ProgressData }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: { runId: string; status: RunStatus; approvalId: string | null } };
