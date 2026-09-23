import { env } from "../../config/env.js";
import { runtimeUnavailable, upstreamError } from "../../lib/http/errors.js";
import { errorMessage } from "../../lib/logger.js";
import type { RuntimeAgentSummary, RuntimeChunk, RuntimeThread, RuntimeThreadList, SuspendedRunsResponse } from "./runtime.types.js";

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

// The agent catalogue changes only when the runtime restarts; cache it briefly so the
// registry, workspace, and health probe do not each hit the runtime.
const agentsCache = createCache<Record<string, RuntimeAgentSummary>>(15_000);

async function listAgentsCached(timeoutMs?: number): Promise<Record<string, RuntimeAgentSummary>> {
  return agentsCache.get("all", () => request("/api/agents", { timeoutMs }));
}

// Design docs, QA workspace files, and test-run history change only when a Gate runs;
// container state changes faster (hence the shorter TTL), but is still cheap to dedupe
// across near-simultaneous pollers.
const workspaceEpicsCache = createCache<{ epics: string[] }>(15_000);
const workspaceFilesCache = createCache<{ files: { path: string; size: number | null }[] }>(15_000);
const qaWorkspaceEpicsCache = createCache<{ epics: string[] }>(15_000);
const qaWorkspaceFilesCache = createCache<{ files: { path: string; size: number | null }[] }>(15_000);
const dockerRunsCache = createCache<{ runs: Record<string, string>[] }>(4_000);
const testRunsCache = createCache<{
  epicKey: string;
  runs: {
    draftId: string;
    taskKey: string;
    discipline: string;
    createdAt: string;
    passed: number;
    failed: number;
    skipped: number;
    summary: string | null;
    failureNotes: { name: string; verdict: string; note: string }[];
    attempt: number;
    halted: boolean;
    haltReason: string | null;
    bugKey: string | null;
    history: unknown[];
  }[];
}>(15_000);

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

  // Custom routes registered in apps/agent-runtime/src/mastra/server/workspace-routes.ts -
  // access to the Architect's per-Epic workspace (docs/ARCHITECTURE.md section 6.3).
  listWorkspaceEpics(): Promise<{ epics: string[] }> {
    return workspaceEpicsCache.get("all", () => request(`/workspace`));
  },

  listWorkspaceFiles(epicKey: string): Promise<{ files: { path: string; size: number | null }[] }> {
    return workspaceFilesCache.get(epicKey, () => request(`/workspace/${encodeURIComponent(epicKey)}/files`));
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

  // Custom routes registered in apps/agent-runtime/src/mastra/server/dev-workspace-routes.ts -
  // read-only viewer for a Task's scaffolded directory (Gate 4/5 output).
  // taskKey, when given, browses that Task's own isolated git worktree instead of the shared
  // base scaffold ("Concurrent Task Execution" milestone - real code lives in worktrees once a
  // discipline has been scaffolded).
  listDevWorkspaceFiles(epicKey: string, discipline: string, taskKey?: string): Promise<{ files: { path: string; size: number }[] }> {
    const params = taskKey ? `?${new URLSearchParams({ taskKey }).toString()}` : "";
    return request(`/dev-workspace/${encodeURIComponent(epicKey)}/${encodeURIComponent(discipline)}/files${params}`);
  },

  readDevWorkspaceFile(epicKey: string, discipline: string, path: string, taskKey?: string): Promise<{ path: string; content: string }> {
    const params = new URLSearchParams({ path, ...(taskKey ? { taskKey } : {}) });
    return request(`/dev-workspace/${encodeURIComponent(epicKey)}/${encodeURIComponent(discipline)}/file?${params.toString()}`);
  },

  // Overwrites one existing scaffolded file with human-edited content - the caller
  // (dev-workspace.router.ts) gates this to the developer role and audits every call, same
  // pattern as writeWorkspaceFile above.
  writeDevWorkspaceFile(epicKey: string, discipline: string, path: string, content: string, taskKey?: string): Promise<{ path: string; content: string }> {
    return request(`/dev-workspace/${encodeURIComponent(epicKey)}/${encodeURIComponent(discipline)}/file`, { method: "PUT", body: JSON.stringify({ path, content, taskKey }) });
  },

  // Custom route registered in apps/agent-runtime/src/mastra/server/docker-runs-routes.ts -
  // which Gate 4/5/7 containers are currently running or recently ran. `epicKey` is forwarded
  // as `?epic=` so callers scoped to one Epic (e.g. DevFilesPage) don't fetch every container.
  listDockerRuns(epicKey?: string): Promise<{ runs: Record<string, string>[] }> {
    return dockerRunsCache.get(epicKey ?? "all", () => {
      const params = epicKey ? `?${new URLSearchParams({ epic: epicKey }).toString()}` : "";
      return request(`/docker/runs${params}`);
    });
  },

  // Custom routes registered in apps/agent-runtime/src/mastra/server/qa-workspace-routes.ts -
  // read-only viewer for Gate 6's test plan + Playwright source, same shape as the Architect
  // workspace routes above.
  listQaWorkspaceEpics(): Promise<{ epics: string[] }> {
    return qaWorkspaceEpicsCache.get("all", () => request(`/qa-workspace`));
  },

  listQaWorkspaceFiles(epicKey: string): Promise<{ files: { path: string; size: number | null }[] }> {
    return qaWorkspaceFilesCache.get(epicKey, () => request(`/qa-workspace/${encodeURIComponent(epicKey)}/files`));
  },

  readQaWorkspaceFile(epicKey: string, path: string): Promise<{ path: string; content: string }> {
    const params = new URLSearchParams({ path });
    return request(`/qa-workspace/${encodeURIComponent(epicKey)}/file?${params.toString()}`);
  },

  // Overwrites one existing test-plan/spec file with human-edited content - the caller
  // (qa-workspace.router.ts) gates this to the qa_engineer role and audits every call, same
  // pattern as writeWorkspaceFile above.
  writeQaWorkspaceFile(epicKey: string, path: string, content: string): Promise<{ path: string; content: string }> {
    return request(`/qa-workspace/${encodeURIComponent(epicKey)}/file`, { method: "PUT", body: JSON.stringify({ path, content }) });
  },

  // Custom route registered in apps/agent-runtime/src/mastra/server/test-runs-routes.ts -
  // Gate 7's real test-run history for an Epic (optionally one Task).
  listTestRuns(
    epicKey: string,
    taskKey?: string,
  ): Promise<{
    epicKey: string;
    runs: {
      draftId: string;
      taskKey: string;
      discipline: string;
      createdAt: string;
      passed: number;
      failed: number;
      skipped: number;
      summary: string | null;
      failureNotes: { name: string; verdict: string; note: string }[];
      attempt: number;
      halted: boolean;
      haltReason: string | null;
      bugKey: string | null;
      history: unknown[];
    }[];
  }> {
    return testRunsCache.get(`${epicKey}:${taskKey ?? ""}`, () => {
      const params = taskKey ? new URLSearchParams({ taskKey }) : null;
      return request(`/test-runs/${encodeURIComponent(epicKey)}${params ? `?${params.toString()}` : ""}`);
    });
  },
};
