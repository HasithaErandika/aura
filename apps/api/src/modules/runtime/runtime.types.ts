// Wire types for apps/agent-runtime (Mastra server). Only the fields the API relies on are
// typed; everything else is passed through untouched.

export interface RuntimeAgentSummary {
  name: string;
  description?: string;
  provider?: string;
  modelId?: string;
  supportsMemory?: boolean;
  tools: Record<string, { id?: string; description?: string }>;
  metadata?: Record<string, unknown>;
  defaultOptions?: { maxSteps?: number };
}

export interface RuntimeThread {
  id: string;
  title?: string;
  resourceId: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeThreadList {
  threads: RuntimeThread[];
  total: number;
  page: number;
  perPage: number | false;
  hasMore: boolean;
}

export type RuntimeChunkType =
  | "start"
  | "step-start"
  | "text-delta"
  | "reasoning-delta"
  | "tool-call"
  | "tool-call-input-streaming-start"
  | "tool-result"
  | "tool-error"
  | "tool-call-suspended"
  | "tool-call-approval"
  | "step-finish"
  | "finish"
  | "error"
  | string;

export interface RuntimeChunk {
  type: RuntimeChunkType;
  runId?: string;
  from?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SuspendedRunsResponse {
  runs: Array<{
    runId: string;
    status: "suspended";
    threadId?: string;
    resourceId?: string;
    suspendedAt: string;
    toolCalls: Array<{
      toolCallId?: string;
      toolName?: string;
      args?: unknown;
      requiresApproval: boolean;
      suspendPayload?: unknown;
    }>;
  }>;
  total: number;
}

export interface AskUserOption {
  label: string;
  value?: string;
  description?: string;
}

export interface AskUserSuspendPayload {
  question: string;
  options?: AskUserOption[];
  selectionMode?: "single_select" | "multi_select";
}

// apps/agent-runtime server/runners-routes.ts - only the parts the API itself touches are typed
// closely; the rest is passed through to the web client as-is.
export interface RunnersSnapshot {
  generatedAt: string;
  epicKey: string | null;
  host: Record<string, unknown>;
  docker: Record<string, unknown>;
  sandboxMode: "host" | "docker";
  councils: Record<string, unknown>[];
  checks: Record<string, unknown>[];
  terminals: { id: number; userId: string; label: string; mode: string; startedAt: string }[];
}

// Every turn: the AURA run the runtime's tool gateway tags its spans, metrics and events with
// (agent-runtime gateway/context.ts RUN_CONTEXT_KEY).
export const RUN_CONTEXT_KEY = "auraRun";

export interface RuntimeRunContext {
  runId: string;
  // The conversation the run belongs to (a Task's plan lock is per conversation).
  threadId: string | null;
  requestId: string | null;
  userId: string;
  role: string;
}

// Resumed turns: the human decision that resumed the run, for every decision type. The runtime's
// gateway lets a gated step run only after an approve/answer decision, and only once per
// decision (agent-runtime gateway/context.ts DECISION_CONTEXT_KEY).
export const DECISION_CONTEXT_KEY = "auraDecision";

export interface RuntimeDecision {
  approvalId: string;
  decision: "approve" | "revise" | "reject" | "answer";
  userId: string;
  role: string;
  decidedAt: string;
}

// The human whose approval resumed a run, sent to the runtime as requestContext[APPROVER_CONTEXT_KEY]
// (mirrors agent-runtime tools/delegate-tools/shared.ts Approver).
export const APPROVER_CONTEXT_KEY = "auraApprover";

export interface RuntimeApprover {
  userId: string;
  role: string;
  name: string | null;
  email: string | null;
  gitName: string | null;
  gitEmail: string | null;
}

// Every turn: dashboard settings for the runtime (Coding Council limits, injection policy), only
// the ones set in the dashboard; the runtime's .env covers the rest and the runtime re-checks
// every bound (agent-runtime gateway/context.ts SETTINGS_CONTEXT_KEY, apps/api modules/settings).
export const SETTINGS_CONTEXT_KEY = "auraSettings";

// GET /usage/tokens on the runtime (agent-runtime store/token-ledger.ts TokenReport).
export interface TokenUsageReport {
  since: string;
  days: number;
  totals: { calls: number; input: number; output: number; reasoning: number; cached: number };
  agents: { agent: string; calls: number; input: number; output: number; reasoning: number; cached: number; avgInput: number; avgOutput: number; share: number }[];
  models: { model: string; calls: number; input: number; output: number }[];
  contextSaved: { chars: number; approxTokens: number };
}
