import { env } from "../../config/env.js";
import { HttpError, runtimeUnavailable, upstreamError } from "../../lib/http/errors.js";
import { safeJson } from "../../lib/json.js";
import { errorMessage } from "../../lib/logger.js";
import { TtlCache } from "../../lib/ttl-cache.js";
import { parseSse } from "./runtime.sse.js";
import type { RuntimeAgentSummary, RuntimeChunk, RuntimeThread, RuntimeThreadList, TokenUsageReport } from "./runtime.types.js";

interface MemoryRef {
  thread: string;
  resource: string;
}

interface StreamBody {
  messages: Array<{ role: "user"; content: string }>;
  memory: MemoryRef;
  requestContext?: Record<string, unknown>;
}

interface ResumeBody {
  runId: string;
  toolCallId?: string;
  resumeData: unknown;
  memory?: MemoryRef;
  requestContext?: Record<string, unknown>;
}

const AGENTS_CACHE_MS = 15_000;
const HEALTH_TIMEOUT_MS = 4000;
const USAGE_TIMEOUT_MS = 8000;
const agentsCache = new TtlCache<Record<string, RuntimeAgentSummary>>(AGENTS_CACHE_MS, 1);

function headers(accept: string): Record<string, string> {
  return { "Content-Type": "application/json", Accept: accept, ...(env.runtimeToken ? { Authorization: `Bearer ${env.runtimeToken}` } : {}) };
}

const unreachable = (error: unknown) => runtimeUnavailable(`Agent runtime is unreachable at ${env.runtimeUrl}: ${errorMessage(error)}`);

async function failed(res: Response, path: string): Promise<HttpError> {
  return upstreamError(`Agent runtime responded ${res.status} for ${path}`, safeJson(await res.text().catch(() => "")));
}

async function request<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? env.runtimeTimeoutMs);
  try {
    const res = await fetch(`${env.runtimeUrl}${path}`, {
      method: init.method ?? "GET",
      headers: headers("application/json"),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    if (!res.ok) throw await failed(res, path);
    const text = await res.text();
    return (text ? safeJson(text) : undefined) as T;
  } catch (error) {
    throw error instanceof HttpError ? error : unreachable(error);
  } finally {
    clearTimeout(timeout);
  }
}

async function openStream(path: string, body: unknown, signal?: AbortSignal): Promise<AsyncGenerator<RuntimeChunk>> {
  let res: Response;
  try {
    res = await fetch(`${env.runtimeUrl}${path}`, { method: "POST", headers: headers("text/event-stream"), body: JSON.stringify(body), signal });
  } catch (error) {
    throw unreachable(error);
  }
  if (!res.ok || !res.body) throw await failed(res, path);
  return parseSse(res.body);
}

const threadPath = (threadId: string, agentId: string) => `/api/memory/threads/${encodeURIComponent(threadId)}?${new URLSearchParams({ agentId })}`;
const agentPath = (agentId: string, action: string) => `/api/agents/${encodeURIComponent(agentId)}/${action}`;

export const runtimeClient = {
  async health(): Promise<{ ok: boolean; agents: string[]; message?: string }> {
    try {
      const agents = await agentsCache.getOrLoad("all", () => request("/api/agents", { timeoutMs: HEALTH_TIMEOUT_MS }));
      return { ok: true, agents: Object.keys(agents) };
    } catch (error) {
      agentsCache.delete("all");
      return { ok: false, agents: [], message: errorMessage(error) };
    }
  },

  listAgents(): Promise<Record<string, RuntimeAgentSummary>> {
    return agentsCache.getOrLoad("all", () => request("/api/agents"));
  },

  listThreads(agentId: string, resourceId: string): Promise<RuntimeThreadList> {
    return request(`/api/memory/threads?${new URLSearchParams({ agentId, resourceId, perPage: "100", page: "0" })}`);
  },

  getThread(agentId: string, threadId: string): Promise<RuntimeThread> {
    return request(threadPath(threadId, agentId));
  },

  createThread(agentId: string, resourceId: string, title?: string, metadata?: Record<string, unknown>): Promise<RuntimeThread> {
    return request(`/api/memory/threads?${new URLSearchParams({ agentId })}`, { method: "POST", body: { resourceId, title, metadata } });
  },

  updateThread(agentId: string, threadId: string, patch: { title?: string; metadata?: Record<string, unknown> }): Promise<RuntimeThread> {
    return request(threadPath(threadId, agentId), { method: "PATCH", body: patch });
  },

  deleteThread(agentId: string, threadId: string): Promise<void> {
    return request(threadPath(threadId, agentId), { method: "DELETE" });
  },

  listMessages(agentId: string, threadId: string, resourceId: string): Promise<{ messages: unknown[] }> {
    return request(`/api/memory/threads/${encodeURIComponent(threadId)}/messages?${new URLSearchParams({ agentId, resourceId, perPage: "200", page: "0" })}`);
  },

  stream(agentId: string, body: StreamBody, signal?: AbortSignal) {
    return openStream(agentPath(agentId, "stream"), body, signal);
  },

  resumeStream(agentId: string, body: ResumeBody, signal?: AbortSignal) {
    return openStream(agentPath(agentId, "resume-stream"), body, signal);
  },

  tokenUsage(days: number): Promise<TokenUsageReport> {
    return request(`/usage/tokens?${new URLSearchParams({ days: String(days) })}`, { timeoutMs: USAGE_TIMEOUT_MS });
  },
};
