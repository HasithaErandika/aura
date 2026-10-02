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

type RuntimeChunkType =
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

// Must match agent-runtime gateway/context.ts.
export const RUN_CONTEXT_KEY = "auraRun";

export interface RuntimeRunContext {
  runId: string;
  threadId: string | null;
  requestId: string | null;
  userId: string;
  role: string;
}

export const DECISION_CONTEXT_KEY = "auraDecision";

export interface RuntimeDecision {
  approvalId: string;
  decision: "approve" | "revise" | "reject" | "answer";
  userId: string;
  role: string;
  decidedAt: string;
}

export const SETTINGS_CONTEXT_KEY = "auraSettings";

export interface TokenUsageReport {
  since: string;
  days: number;
  totals: { calls: number; input: number; output: number; reasoning: number; cached: number };
  agents: { agent: string; calls: number; input: number; output: number; reasoning: number; cached: number; avgInput: number; avgOutput: number; share: number }[];
  models: { model: string; calls: number; input: number; output: number }[];
  contextSaved: { chars: number; approxTokens: number };
}
