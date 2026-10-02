import { api } from "@/shared/api/client.ts";
import type { RegistryAgent } from "@/shared/api/types.ts";
import type { Thread, ThreadHistory } from "./types.ts";

const q = (agentId: string) => `agentId=${encodeURIComponent(agentId)}`;

export const workspaceApi = {
  agents: () => api.get<{ agents: RegistryAgent[] }>("/agents").then((r) => r.agents),
  threads: (agentId: string) => api.get<{ threads: Thread[] }>(`/threads?${q(agentId)}`).then((r) => r.threads),
  createThread: (agentId: string) => api.post<{ thread: Thread }>("/threads", { agentId }).then((r) => r.thread),
  renameThread: (agentId: string, threadId: string, title: string) => api.patch<{ thread: Thread }>(`/threads/${threadId}`, { agentId, title }).then((r) => r.thread),
  deleteThread: (agentId: string, threadId: string) => api.delete<void>(`/threads/${threadId}?${q(agentId)}`),
  history: (agentId: string, threadId: string) => api.get<ThreadHistory>(`/threads/${threadId}/messages?${q(agentId)}`),
};
