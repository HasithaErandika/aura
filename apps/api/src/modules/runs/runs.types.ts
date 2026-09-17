import type { Role } from "../identity/roles.js";

export const RUN_STATUSES = [
  "PENDING",
  "RUNNING",
  "SUSPENDED_FOR_APPROVAL",
  "SUCCEEDED",
  "FAILED",
  "REJECTED",
  "EXPIRED",
  "HALTED_LOOP_GUARD",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const ACTIVE_RUN_STATUSES: RunStatus[] = ["PENDING", "RUNNING", "SUSPENDED_FOR_APPROVAL"];

export interface RunRow {
  id: string;
  agent_id: string;
  thread_id: string;
  runtime_run_id: string | null;
  requested_by: string;
  requested_by_role: Role;
  status: RunStatus;
  current_agent: string | null;
  agents_involved: string[];
  title: string | null;
  input_summary: string | null;
  output_summary: string | null;
  last_error: string | null;
  started_at: string;
  finished_at: string | null;
  updated_at: string;
}

export const RUN_STEP_KINDS = ["tool-call", "tool-result", "tool-error", "text", "suspended", "resumed", "error", "finish"] as const;
export type RunStepKind = (typeof RUN_STEP_KINDS)[number];

export interface RunStepRow {
  id: number;
  run_id: string;
  seq: number;
  kind: RunStepKind;
  tool_name: string | null;
  tool_call_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface RunView {
  id: string;
  agentId: string;
  threadId: string;
  runtimeRunId: string | null;
  requestedBy: string;
  requestedByRole: Role;
  requester?: { fullName: string | null; email: string } | null;
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

export function toRunView(row: RunRow, requester?: { fullName: string | null; email: string } | null): RunView {
  return {
    id: row.id,
    agentId: row.agent_id,
    threadId: row.thread_id,
    runtimeRunId: row.runtime_run_id,
    requestedBy: row.requested_by,
    requestedByRole: row.requested_by_role,
    requester: requester ?? null,
    status: row.status,
    currentAgent: row.current_agent,
    agentsInvolved: row.agents_involved ?? [],
    title: row.title,
    inputSummary: row.input_summary,
    outputSummary: row.output_summary,
    lastError: row.last_error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at,
  };
}

export interface RunStepView {
  id: number;
  seq: number;
  kind: RunStepKind;
  toolName: string | null;
  toolCallId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export function toRunStepView(row: RunStepRow): RunStepView {
  return {
    id: row.id,
    seq: row.seq,
    kind: row.kind,
    toolName: row.tool_name,
    toolCallId: row.tool_call_id,
    payload: row.payload,
    createdAt: row.created_at,
  };
}
