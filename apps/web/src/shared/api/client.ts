import { env } from "@/config/env.ts";
import { supabase } from "./supabase.ts";
import { ApiError } from "./errors.ts";
import { parseSseFrame, splitSseBuffer } from "./sse.ts";

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

const inFlightGets = new Map<string, Promise<unknown>>();

function getDeduped<T>(path: string): Promise<T> {
  const existing = inFlightGets.get(path) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = request<T>(path).finally(() => inFlightGets.delete(path));
  inFlightGets.set(path, promise);
  return promise;
}

const withBody = (method: string, body: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  get: <T>(path: string) => getDeduped<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, withBody("POST", body)),
  put: <T>(path: string, body?: unknown) => request<T>(path, withBody("PUT", body)),
  patch: <T>(path: string, body?: unknown) => request<T>(path, withBody("PATCH", body)),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export interface SseHandlers {
  onEvent: (event: string, data: unknown) => void;
  signal?: AbortSignal;
}

type FrameHandler = (event: string, data: unknown, id: number | null) => void;

async function readSse(res: Response, onFrame: FrameHandler): Promise<void> {
  if (!res.body) throw new ApiError(502, "no_body", "The server returned an empty stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const dispatch = (raw: string) => {
    const frame = parseSseFrame(raw);
    if (frame) onFrame(frame.event, frame.data, frame.id);
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const { frames, rest } = splitSseBuffer(buffer + decoder.decode(value, { stream: true }));
    buffer = rest;
    frames.forEach(dispatch);
  }
  if (buffer.trim()) dispatch(buffer);
}

const RECONNECT_ATTEMPTS = 6;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openEvents(runId: string, after: number | "turn", signal?: AbortSignal): Promise<Response> {
  return fetch(`${env.apiUrl}/runs/${runId}/events?after=${after}`, {
    headers: { Accept: "text/event-stream", ...(await authHeader()) },
    signal,
  });
}

async function consumeRunStream(first: Response, handlers: SseHandlers, knownRunId: string | null): Promise<void> {
  let runId = knownRunId;
  let lastId = 0;
  let finished = false;
  const onFrame: FrameHandler = (event, data, id) => {
    if (id) lastId = id;
    const maybeRunId = (data as { runId?: unknown } | null)?.runId;
    if (event === "run" && typeof maybeRunId === "string") runId = maybeRunId;
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
      const again = await openEvents(runId, lastId || "turn", handlers.signal);
      if (again.ok) await readSse(again, onFrame);
    } catch (error) {
      if (aborted()) throw error;
    }
  }
}

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

export async function followRunStream(runId: string, handlers: SseHandlers): Promise<void> {
  const res = await openEvents(runId, "turn", handlers.signal);
  if (!res.ok) throw await toApiError(res);
  await consumeRunStream(res, handlers, runId);
}
