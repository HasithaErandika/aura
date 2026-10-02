import { readSse } from "./sse.js";
import type { Approval, AuraNotification, ApprovalStatus, BridgeStatus, Decision, DeviceSignIn, JiraEpicDetail, JiraIssueDetail, JiraIssueSummary, Me, Project, TaskDependencies, TaskPr, Thread, ThreadHistory, TurnEvent } from "./types.js";

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

  async function open(method: "GET" | "POST", path: string, body: unknown, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, { method, headers: await headers("text/event-stream"), body: body === undefined ? undefined : JSON.stringify(body), signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new AuraApiError(0, "unreachable", `AURA API is unreachable at ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!res.ok) throw await toError(res);
    if (!res.body) throw new AuraApiError(502, "no_body", "The server returned an empty stream");
    return res.body;
  }

  // A turn's events. Turns run as background jobs on the server, so when the stream drops before
  // the turn's "done" event it is resumed from the last event id (GET /runs/:id/events).
  async function* stream(path: string, body: unknown, signal?: AbortSignal, knownRunId: string | null = null, method: "GET" | "POST" = "POST"): AsyncGenerator<TurnEvent> {
    let runId = knownRunId;
    let lastId = 0;
    let finished = false;
    const relay = async function* (source: ReadableStream<Uint8Array>): AsyncGenerator<TurnEvent> {
      for await (const message of readSse(source)) {
        if (message.id) lastId = message.id;
        const event = message as TurnEvent;
        if (event.event === "run") runId = event.data.runId;
        if (event.event === "done") finished = true;
        yield event;
      }
    };
    try {
      yield* relay(await open(method, path, body, signal));
    } catch (error) {
      if (signal?.aborted || error instanceof AuraApiError) throw error;
    }
    for (let attempt = 1; !finished && runId && !signal?.aborted && attempt <= 6; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * attempt, 5000)));
      try {
        yield* relay(await open("GET", `/runs/${encodeURIComponent(runId)}/events?after=${lastId || "turn"}`, undefined, signal));
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
  }

  const q = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined));
    const text = search.toString();
    return text ? `?${text}` : "";
  };

  return {
    baseUrl,

    me: () => request<Me>("GET", "/me"),

    jira: {
      epics: (q?: string) => request<{ epics: JiraIssueSummary[] }>("GET", `/jira/epics${q ? `?q=${encodeURIComponent(q)}` : ""}`).then((r) => r.epics),
      epic: (epicKey: string) => request<JiraEpicDetail>("GET", `/jira/epics/${encodeURIComponent(epicKey)}`),
      issue: (key: string) => request<{ issue: JiraIssueDetail }>("GET", `/jira/issues/${encodeURIComponent(key)}`).then((r) => r.issue),
    },

    threads: {
      list: (agentId = ORCHESTRATOR_AGENT_ID) => request<{ threads: Thread[] }>("GET", `/threads${q({ agentId })}`).then((r) => r.threads),
      create: (title: string, agentId = ORCHESTRATOR_AGENT_ID) => request<{ thread: Thread }>("POST", "/threads", { agentId, title }).then((r) => r.thread),
      // Starts a turn and yields its live events until the turn finishes or suspends at a gate.
      send: (threadId: string, message: string, opts: { agentId?: string; signal?: AbortSignal } = {}) =>
        stream(`/threads/${encodeURIComponent(threadId)}/messages`, { agentId: opts.agentId ?? ORCHESTRATOR_AGENT_ID, message }, opts.signal),
      history: (threadId: string, agentId = ORCHESTRATOR_AGENT_ID) => request<ThreadHistory>("GET", `/threads/${encodeURIComponent(threadId)}/messages${q({ agentId })}`),
    },

    runs: {
      // Follows a run's current turn (e.g. after reopening VS Code while it was still running).
      follow: (runId: string, signal?: AbortSignal) => stream(`/runs/${encodeURIComponent(runId)}/events?after=turn`, undefined, signal, runId, "GET"),
      // Stops a running turn (VS Code Stop). Its stream then ends with an INTERRUPTED "done".
      stop: (runId: string) => request<{ result: "stopped" | "dequeued" }>("POST", `/runs/${encodeURIComponent(runId)}/stop`).then((r) => r.result),
      // A note to a running Task: the coders read it at their next step.
      note: (runId: string, text: string) => request<{ note: { id: string; text: string; createdAt: string } }>("POST", `/runs/${encodeURIComponent(runId)}/notes`, { text }).then((r) => r.note),
    },

    projects: {
      list: () => request<{ projects: Project[] }>("GET", "/projects").then((r) => r.projects),
    },

    settings: {
      // What applies to the signed-in user in a project: { key: { value, source } }.
      effective: (projectId?: string) => request<{ projectId: string | null; settings: Record<string, { value: string | number | boolean; source: string }> }>("GET", `/settings/effective${q({ projectId })}`).then((r) => r.settings),
    },

    bridge: {
      status: () => request<BridgeStatus>("GET", "/bridge/status"),
    },

    approvals: {
      list: (status: ApprovalStatus[] = ["PENDING"]) => request<{ approvals: Approval[] }>("GET", `/approvals${q({ status: status.join(",") })}`).then((r) => r.approvals),
      get: (id: string) => request<{ approval: Approval }>("GET", `/approvals/${encodeURIComponent(id)}`).then((r) => r.approval),
      // Records the decision, then yields the resumed run's live events.
      decide: (id: string, body: { decision: Decision; answer?: string; reason?: string; snapshotHash?: string }, signal?: AbortSignal) =>
        stream(`/approvals/${encodeURIComponent(id)}/decide`, body, signal),
    },

    // A Task's pull request and CI (V6): the VS Code PR view and the QA page.
    taskPrs: {
      list: (filter: { taskKey?: string; epicKey?: string } = {}) => request<{ taskPrs: TaskPr[] }>("GET", `/task-prs${q(filter)}`).then((r) => r.taskPrs),
      // The Tasks this one waits for: it starts when each is merged.
      dependencies: (taskKey: string) => request<TaskDependencies>("GET", `/task-prs/${encodeURIComponent(taskKey)}/dependencies`),
    },

    notifications: {
      list: () => request<{ notifications: AuraNotification[]; unread: number }>("GET", "/notifications"),
      read: (ids?: string[]) => request<{ ok: true }>("POST", "/notifications/read", ids ? { ids } : {}),
    },
  };
}

export type AuraClient = ReturnType<typeof createAuraClient>;

// Device sign-in (no token yet): start, show the code, open the browser, then poll.
export async function startDeviceSignIn(baseUrl: string, clientName: string, doFetch: typeof fetch = globalThis.fetch): Promise<DeviceSignIn> {
  const res = await doFetch(`${baseUrl.replace(/\/+$/, "")}/auth/device/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientName }) });
  if (!res.ok) throw new AuraApiError(res.status, "device_start_failed", `Could not start sign-in (${res.status})`);
  return (await res.json()) as DeviceSignIn;
}

export type DevicePoll = { status: "approved"; token: string } | { status: "authorization_pending" | "slow_down" | "access_denied" | "expired_token" };

export async function pollDeviceSignIn(baseUrl: string, deviceCode: string, doFetch: typeof fetch = globalThis.fetch): Promise<DevicePoll> {
  const res = await doFetch(`${baseUrl.replace(/\/+$/, "")}/auth/device/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceCode }) });
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (res.ok && body.token) return { status: "approved", token: body.token };
  const status = body.error;
  return { status: status === "slow_down" || status === "access_denied" || status === "expired_token" ? status : "authorization_pending" };
}
