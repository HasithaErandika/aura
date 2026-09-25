import { readSse } from "./sse.js";
import type { Approval, ApprovalStatus, CouncilUsage, Decision, GitIdentity, JiraEpicDetail, JiraIssueDetail, Me, TaskWorktree, Thread, TurnEvent } from "./types.js";

export interface AuraClientOptions {
  // apps/api base URL, e.g. http://localhost:4000
  baseUrl: string;
  // A personal access token (aura_pat_...) or a Supabase session access token.
  token: string | (() => string | Promise<string>);
  fetch?: typeof fetch;
}

export class AuraApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AuraApiError";
  }
}

// The Orchestrator is the only agent a client talks to directly; it delegates to every other
// agent through its own governed tools (apps/agent-runtime agents/orchestrator.ts).
export const ORCHESTRATOR_AGENT_ID = "orchestrator";

export function createAuraClient(options: AuraClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetch ?? globalThis.fetch;

  async function headers(accept = "application/json"): Promise<Record<string, string>> {
    const token = typeof options.token === "function" ? await options.token() : options.token;
    return { "Content-Type": "application/json", Accept: accept, Authorization: `Bearer ${token}` };
  }

  async function toError(res: Response): Promise<AuraApiError> {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: unknown } } | null;
    return new AuraApiError(res.status, body?.error?.code ?? "request_failed", body?.error?.message ?? `Request failed with status ${res.status}`, body?.error?.details);
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, { method, headers: await headers(), body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (error) {
      throw new AuraApiError(0, "unreachable", `AURA API is unreachable at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!res.ok) throw await toError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async function* stream(path: string, body: unknown, signal?: AbortSignal): AsyncGenerator<TurnEvent> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, { method: "POST", headers: await headers("text/event-stream"), body: JSON.stringify(body), signal });
    } catch (error) {
      throw new AuraApiError(0, "unreachable", `AURA API is unreachable at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!res.ok) throw await toError(res);
    if (!res.body) throw new AuraApiError(502, "no_body", "The server returned an empty stream");
    for await (const message of readSse(res.body)) yield message as TurnEvent;
  }

  const q = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined));
    const text = search.toString();
    return text ? `?${text}` : "";
  };

  return {
    baseUrl,

    me: () => request<Me>("GET", "/me"),
    setGitIdentity: (identity: { name: string; email: string }) => request<{ gitIdentity: GitIdentity }>("PUT", "/me/git-identity", identity),

    jira: {
      epic: (epicKey: string) => request<JiraEpicDetail>("GET", `/jira/epics/${encodeURIComponent(epicKey)}`),
      issue: (key: string) => request<{ issue: JiraIssueDetail }>("GET", `/jira/issues/${encodeURIComponent(key)}`).then((r) => r.issue),
    },

    devWorkspace: {
      findTask: (taskKey: string) => request<TaskWorktree>("GET", `/dev-workspace/tasks/${encodeURIComponent(taskKey)}`),
    },

    threads: {
      list: (agentId = ORCHESTRATOR_AGENT_ID) => request<{ threads: Thread[] }>("GET", `/threads${q({ agentId })}`).then((r) => r.threads),
      create: (title: string, agentId = ORCHESTRATOR_AGENT_ID) => request<{ thread: Thread }>("POST", "/threads", { agentId, title }).then((r) => r.thread),
      // Starts a turn and yields its live events until the turn finishes or suspends at a gate.
      send: (threadId: string, message: string, opts: { agentId?: string; signal?: AbortSignal } = {}) =>
        stream(`/threads/${encodeURIComponent(threadId)}/messages`, { agentId: opts.agentId ?? ORCHESTRATOR_AGENT_ID, message }, opts.signal),
    },

    approvals: {
      list: (status: ApprovalStatus[] = ["PENDING"]) => request<{ approvals: Approval[] }>("GET", `/approvals${q({ status: status.join(",") })}`).then((r) => r.approvals),
      get: (id: string) => request<{ approval: Approval }>("GET", `/approvals/${encodeURIComponent(id)}`).then((r) => r.approval),
      // Records the decision, then yields the resumed run's live events (this is where an
      // approved Gate 5 actually executes the coding agent / council).
      decide: (id: string, body: { decision: Decision; answer?: string; reason?: string; snapshotHash?: string }, signal?: AbortSignal) =>
        stream(`/approvals/${encodeURIComponent(id)}/decide`, body, signal),
    },

    council: {
      note: (draftId: string, text: string) => request<{ queued: number }>("POST", `/council/${encodeURIComponent(draftId)}/notes`, { text }),
      usage: () => request<CouncilUsage>("GET", "/council/usage"),
    },
  };
}

export type AuraClient = ReturnType<typeof createAuraClient>;
