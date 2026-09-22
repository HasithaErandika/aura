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

// POST with a JSON body and consume the server-sent-events response. EventSource cannot send
// a bearer token or a body, so this reads the stream with fetch.
export async function streamRequest(path: string, body: unknown, handlers: SseHandlers): Promise<void> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(await authHeader()) },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });
  if (!res.ok) throw await toApiError(res);
  if (!res.body) throw new ApiError(502, "no_body", "The server returned an empty stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (frame: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return;
    let data: unknown = dataLines.join("\n");
    try {
      data = JSON.parse(dataLines.join("\n"));
    } catch {
      // keep as text
    }
    handlers.onEvent(event, data);
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
