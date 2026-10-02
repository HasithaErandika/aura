import { env } from "../../config/env.js";
import { runtimeUnavailable, upstreamError } from "../../lib/http/errors.js";
import { errorMessage } from "../../lib/logger.js";
import type { RuntimeAgentSummary, RuntimeChunk, RuntimeThread, RuntimeThreadList, SuspendedRunsResponse, TokenUsageReport } from "./runtime.types.js";

interface StreamBody {
  messages: Array<{ role: "user"; content: string }>;
  memory: { thread: string; resource: string };
  runId?: string;
  requestContext?: Record<string, unknown>;
}

interface ResumeBody {
  runId: string;
  toolCallId?: string;
  resumeData: unknown;
  memory?: { thread: string; resource: string };
  requestContext?: Record<string, unknown>;
}

function baseHeaders(accept: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: accept };
  if (env.runtimeToken) headers.Authorization = `Bearer ${env.runtimeToken}`;
  return headers;
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? env.runtimeTimeoutMs);
  try {
    const res = await fetch(`${env.runtimeUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...baseHeaders("application/json"), ...(init?.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw upstreamError(`Agent runtime responded ${res.status} for ${path}`, safeJson(body));
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "HttpError") throw error;
    throw runtimeUnavailable(`Agent runtime is unreachable at ${env.runtimeUrl}: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

// Parses a Mastra SSE body ("data: {json}\n\n" frames) into chunk objects.
async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<RuntimeChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) {
          try {
            yield JSON.parse(data) as RuntimeChunk;
          } catch {
            // A non-JSON frame is a runtime keepalive or comment; ignore it.
          }
        }
        separator = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function openStream(path: string, body: unknown, signal?: AbortSignal): Promise<AsyncGenerator<RuntimeChunk>> {
  let res: Response;
  try {
    res = await fetch(`${env.runtimeUrl}${path}`, {
      method: "POST",
      headers: baseHeaders("text/event-stream"),
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw runtimeUnavailable(`Agent runtime is unreachable at ${env.runtimeUrl}: ${errorMessage(error)}`);
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw upstreamError(`Agent runtime responded ${res.status} for ${path}`, safeJson(text));
  }
  return parseSse(res.body);
}

// Short-TTL cache for low-churn read-only listings, avoiding repeated runtime round trips.
function createCache<T>(ttlMs: number) {
  const store = new Map<string, { value: T; expiresAt: number }>();
  return {
    async get(key: string, fn: () => Promise<T>): Promise<T> {
      const hit = store.get(key);
      if (hit && hit.expiresAt > Date.now()) return hit.value;
      const value = await fn();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },
    invalidate(key: string) {
      store.delete(key);
    },
  };
}

// The agent catalogue changes only on restart; a short cache spares the runtime repeated calls.
const agentsCache = createCache<Record<string, RuntimeAgentSummary>>(15_000);

async function listAgentsCached(timeoutMs?: number): Promise<Record<string, RuntimeAgentSummary>> {
  return agentsCache.get("all", () => request("/api/agents", { timeoutMs }));
}

export const runtimeClient = {
  async health(): Promise<{ ok: boolean; agents: string[]; message?: string }> {
    try {
      const agents = await listAgentsCached(4000);
      return { ok: true, agents: Object.keys(agents) };
    } catch (error) {
      agentsCache.invalidate("all");
      return { ok: false, agents: [], message: errorMessage(error) };
    }
  },

  listAgents(): Promise<Record<string, RuntimeAgentSummary>> {
    return listAgentsCached();
  },

  getAgent(agentId: string): Promise<RuntimeAgentSummary> {
    return request(`/api/agents/${encodeURIComponent(agentId)}`);
  },

  listThreads(agentId: string, resourceId: string): Promise<RuntimeThreadList> {
    const params = new URLSearchParams({ agentId, resourceId, perPage: "100", page: "0" });
    return request(`/api/memory/threads?${params.toString()}`);
  },

  getThread(agentId: string, threadId: string): Promise<RuntimeThread> {
    const params = new URLSearchParams({ agentId });
    return request(`/api/memory/threads/${encodeURIComponent(threadId)}?${params.toString()}`);
  },

  createThread(agentId: string, resourceId: string, title?: string, metadata?: Record<string, unknown>): Promise<RuntimeThread> {
    const params = new URLSearchParams({ agentId });
    return request(`/api/memory/threads?${params.toString()}`, {
      method: "POST",
      body: JSON.stringify({ resourceId, title, metadata }),
    });
  },

  updateThread(agentId: string, threadId: string, patch: { title?: string; metadata?: Record<string, unknown> }): Promise<RuntimeThread> {
    const params = new URLSearchParams({ agentId });
    return request(`/api/memory/threads/${encodeURIComponent(threadId)}?${params.toString()}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  deleteThread(agentId: string, threadId: string): Promise<void> {
    const params = new URLSearchParams({ agentId });
    return request(`/api/memory/threads/${encodeURIComponent(threadId)}?${params.toString()}`, { method: "DELETE" });
  },

  listMessages(agentId: string, threadId: string, resourceId: string): Promise<{ messages: unknown[]; uiMessages: unknown[] | null }> {
    const params = new URLSearchParams({ agentId, resourceId, perPage: "200", page: "0" });
    return request(`/api/memory/threads/${encodeURIComponent(threadId)}/messages?${params.toString()}`);
  },

  listSuspendedRuns(agentId: string, threadId?: string): Promise<SuspendedRunsResponse> {
    const params = new URLSearchParams();
    if (threadId) params.set("threadId", threadId);
    const qs = params.toString();
    return request(`/api/agents/${encodeURIComponent(agentId)}/suspended-runs${qs ? `?${qs}` : ""}`);
  },

  stream(agentId: string, body: StreamBody, signal?: AbortSignal) {
    return openStream(`/api/agents/${encodeURIComponent(agentId)}/stream`, body, signal);
  },

  resumeStream(agentId: string, body: ResumeBody, signal?: AbortSignal) {
    return openStream(`/api/agents/${encodeURIComponent(agentId)}/resume-stream`, body, signal);
  },

  // Tokens per agent and model (agent-runtime store/token-ledger.ts).
  tokenUsage(days: number): Promise<TokenUsageReport> {
    return request(`/usage/tokens?days=${encodeURIComponent(String(days))}`, { timeoutMs: 8000 });
  },
};
