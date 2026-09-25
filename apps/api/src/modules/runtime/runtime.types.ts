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
