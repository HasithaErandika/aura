import { api, streamRequest } from "../../shared/api/client.ts";
import type { Decision, RegistryAgent, StreamEvent, Thread, ThreadHistory } from "../../types/api.ts";

export type StreamListener = (event: StreamEvent) => void;

function asStreamEvent(event: string, data: unknown): StreamEvent | null {
  switch (event) {
    case "run":
    case "text":
    case "tool":
    case "gate":
    case "decision":
    case "error":
    case "done":
      return { event, data } as StreamEvent;
    default:
      return null;
  }
}

export const workspaceApi = {
  agents: () => api.get<{ agents: RegistryAgent[] }>("/agents").then((r) => r.agents),
  threads: (agentId: string) => api.get<{ threads: Thread[] }>(`/threads?agentId=${encodeURIComponent(agentId)}`).then((r) => r.threads),
  createThread: (agentId: string, title?: string) => api.post<{ thread: Thread }>("/threads", { agentId, title }).then((r) => r.thread),
  deleteThread: (agentId: string, threadId: string) => api.delete<void>(`/threads/${threadId}?agentId=${encodeURIComponent(agentId)}`),
  history: (agentId: string, threadId: string) => api.get<ThreadHistory>(`/threads/${threadId}/messages?agentId=${encodeURIComponent(agentId)}`),

  send: (agentId: string, threadId: string, message: string, listener: StreamListener, signal?: AbortSignal) =>
    streamRequest(`/threads/${threadId}/messages`, { agentId, message }, {
      signal,
      onEvent: (event, data) => {
        const parsed = asStreamEvent(event, data);
        if (parsed) listener(parsed);
      },
    }),

  decide: (
    approvalId: string,
    body: { decision: Decision; answer?: string; reason?: string; snapshotHash?: string },
    listener: StreamListener,
    signal?: AbortSignal,
  ) =>
    streamRequest(`/approvals/${approvalId}/decide`, body, {
      signal,
      onEvent: (event, data) => {
        const parsed = asStreamEvent(event, data);
        if (parsed) listener(parsed);
      },
    }),
};
