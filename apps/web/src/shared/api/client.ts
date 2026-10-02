import { env } from "../../config/env.ts";
import { supabase } from "./supabase.ts";
import { ApiError } from "./errors.ts";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: unknown } } | null;
  const error = body?.error;
  return new ApiError(res.status, error?.code ?? "request_failed", error?.message ?? `Request failed with status ${res.status}`, error?.details);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await authHeader()), ...(init?.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Dedupes concurrent identical GETs (e.g. two components mounting the same hook on one page)
// so they share one round trip instead of each firing their own. Keyed by path, and only
// holds the promise while it's in flight - not a response cache, so a later independent call
// (a reload(), a poll tick) always goes to the network fresh.
const inFlightGets = new Map<string, Promise<unknown>>();

function getDeduped<T>(path: string): Promise<T> {
  const existing = inFlightGets.get(path) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = request<T>(path).finally(() => inFlightGets.delete(path));
  inFlightGets.set(path, promise);
  return promise;
}

export const api = {
  get: <T>(path: string) => getDeduped<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export interface SseHandlers {
  onEvent: (event: string, data: unknown) => void;
  signal?: AbortSignal;
}

// Reads one SSE response, calling onFrame per event with its id (if the server sent one).
async function readSse(res: Response, onFrame: (event: string, data: unknown, id: number | null) => void): Promise<void> {
  if (!res.body) throw new ApiError(502, "no_body", "The server returned an empty stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (frame: string) => {
    let event = "message";
    let id: number | null = null;
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      else if (line.startsWith("id:")) id = Number(line.slice(3).trim()) || null;
    }
    if (dataLines.length === 0) return;
    let data: unknown = dataLines.join("\n");
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      // keep as text
    }
    onFrame(event, data, id);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      dispatch(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
      idx = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) dispatch(buffer);
}

const RECONNECT_ATTEMPTS = 6;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Consumes a run's SSE stream; if it drops before the turn's "done" event, resumes from the last
// event id with GET /runs/:id/events (the turn keeps running on the server meanwhile).
async function consumeRunStream(first: Response, handlers: SseHandlers, knownRunId: string | null): Promise<void> {
  let runId = knownRunId;
  let lastId = 0;
  let finished = false;
  const onFrame = (event: string, data: unknown, id: number | null) => {
    if (id) lastId = id;
    if (event === "run" && data && typeof (data as { runId?: unknown }).runId === "string") runId = (data as { runId: string }).runId;
    if (event === "done") finished = true;
    handlers.onEvent(event, data);
  };

  const aborted = () => handlers.signal?.aborted === true;
  try {
    await readSse(first, onFrame);
  } catch (error) {
    if (aborted()) throw error;
  }

  for (let attempt = 1; !finished && runId && !aborted() && attempt <= RECONNECT_ATTEMPTS; attempt++) {
    await sleep(Math.min(1000 * attempt, 5000));
    try {
      const again = await fetch(`${env.apiUrl}/runs/${runId}/events?after=${lastId || "turn"}`, {
        headers: { Accept: "text/event-stream", ...(await authHeader()) },
        signal: handlers.signal,
      });
      if (again.ok) await readSse(again, onFrame);
    } catch (error) {
      if (aborted()) throw error;
    }
  }
}

// POST with a JSON body and consume the server-sent-events response. EventSource cannot send
// a bearer token or a body, so this reads the stream with fetch. The turn runs as a background
// job on the server, so a dropped stream is resumed automatically.
export async function streamRequest(path: string, body: unknown, handlers: SseHandlers): Promise<void> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(await authHeader()) },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });
  if (!res.ok) throw await toApiError(res);
  await consumeRunStream(res, handlers, null);
}

// Attaches to a run's current turn (e.g. after a page reload while a turn is still running).
export async function followRunStream(runId: string, handlers: SseHandlers): Promise<void> {
  const res = await fetch(`${env.apiUrl}/runs/${runId}/events?after=turn`, {
    headers: { Accept: "text/event-stream", ...(await authHeader()) },
    signal: handlers.signal,
  });
  if (!res.ok) throw await toApiError(res);
  await consumeRunStream(res, handlers, runId);
}
