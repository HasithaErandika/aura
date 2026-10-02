import { api } from "@/shared/api/client.ts";
import type { AgentQualityRow, TokenUsageReport } from "../types.ts";

export const aiUsageApi = {
  tokenUsage: (days: number) => api.get<TokenUsageReport>(`/dashboard/token-usage?days=${days}`),
  agentQuality: (days: number) => api.get<{ since: string; agents: AgentQualityRow[] }>(`/dashboard/agent-quality?days=${days}`),
};
