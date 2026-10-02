import { api, followRunStream, streamRequest } from "./client.ts";
import { toStreamEvent } from "../lib/stream.ts";
import type { DecisionInput, StreamEvent } from "./types.ts";

export type StreamListener = (event: StreamEvent) => void;

const relay = (listener: StreamListener) => (event: string, data: unknown) => {
  const parsed = toStreamEvent(event, data);
  if (parsed) listener(parsed);
};

export const turnsApi = {
  send: (agentId: string, threadId: string, message: string, listener: StreamListener, signal?: AbortSignal) =>
    streamRequest(`/threads/${threadId}/messages`, { agentId, message }, { signal, onEvent: relay(listener) }),
  follow: (runId: string, listener: StreamListener, signal?: AbortSignal) => followRunStream(runId, { signal, onEvent: relay(listener) }),
  decide: (approvalId: string, body: DecisionInput & { snapshotHash?: string }, listener: StreamListener, signal?: AbortSignal) =>
    streamRequest(`/approvals/${approvalId}/decide`, body, { signal, onEvent: relay(listener) }),
  stop: (runId: string) => api.post<{ result: unknown }>(`/runs/${runId}/stop`),
};
