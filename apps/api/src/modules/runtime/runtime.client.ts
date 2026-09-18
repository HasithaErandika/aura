import { env } from "../../config/env.js";
import { runtimeUnavailable, upstreamError } from "../../lib/http/errors.js";
import { errorMessage } from "../../lib/logger.js";
import type { RuntimeAgentSummary, RuntimeChunk, RuntimeThread, RuntimeThreadList, SuspendedRunsResponse } from "./runtime.types.js";

// HTTP client for the Mastra server in apps/agent-runtime. This is the single place the API
// knows the runtime's routes; nothing else imports fetch against it.

interface StreamBody {
  messages: Array<{ role: "user"; content: string }>;
  memory: { thread: string; resource: string };
  runId?: string;
}

interface ResumeBody {
  runId: string;
  toolCallId?: string;
  resumeData: unknown;
  memory?: { thread: string; resource: string };
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

// The agent catalogue changes only when the runtime restarts; cache it briefly so the
// registry, workspace, and health probe do not each hit the runtime.
const AGENTS_TTL_MS = 15_000;
let agentsCache: { value: Record<string, RuntimeAgentSummary>; expiresAt: number } | null = null;

async function listAgentsCached(timeoutMs?: number): Promise<Record<string, RuntimeAgentSummary>> {
  if (agentsCache && agentsCache.expiresAt > Date.now()) return agentsCache.value;
  const value = await request<Record<string, RuntimeAgentSummary>>("/api/agents", { timeoutMs });
  agentsCache = { value, expiresAt: Date.now() + AGENTS_TTL_MS };
  return value;
}

export const runtimeClient = {
  async health(): Promise<{ ok: boolean; agents: string[]; message?: string }> {
    try {
      const agents = await listAgentsCached(4000);
      return { ok: true, agents: Object.keys(agents) };
    } catch (error) {
      agentsCache = null;
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

  // Custom routes registered in apps/agent-runtime/src/mastra/server/workspace-routes.ts -
  // access to the Architect's per-Epic workspace (docs/ARCHITECTURE.md section 6.3).
  listWorkspaceEpics(): Promise<{ epics: string[] }> {
    return request(`/workspace`);
  },

  listWorkspaceFiles(epicKey: string): Promise<{ files: { path: string; size: number | null }[] }> {
    return request(`/workspace/${encodeURIComponent(epicKey)}/files`);
  },

  readWorkspaceFile(epicKey: string, path: string): Promise<{ path: string; content: string }> {
    const params = new URLSearchParams({ path });
    return request(`/workspace/${encodeURIComponent(epicKey)}/file?${params.toString()}`);
  },

  // Overwrites one existing design document with human-edited content. Narrow and audited by
  // the caller (workspace.router.ts) - see writeWorkspaceFileRoute's own comment for why this
  // cannot create new files or write outside the Epic's workspace.
  writeWorkspaceFile(epicKey: string, path: string, content: string): Promise<{ path: string; content: string }> {
    return request(`/workspace/${encodeURIComponent(epicKey)}/file`, { method: "PUT", body: JSON.stringify({ path, content }) });
  },

  // Which thread last drafted this Epic's architecture, so a human's feedback from the Design
  // Documents page can continue that conversation instead of starting one with no draftId to
  // revise.
  getArchitectThread(epicKey: string): Promise<{ threadId: string | null }> {
    return request(`/workspace/${encodeURIComponent(epicKey)}/thread`);
  },
};
