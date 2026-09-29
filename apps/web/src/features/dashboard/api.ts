import { api } from "../../shared/api/client.ts";
import type { AgentQualityRow, DashboardSummary, TokenUsageReport } from "../../types/api.ts";

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>("/dashboard/summary"),
  tokenUsage: (days: number) => api.get<TokenUsageReport>(`/dashboard/token-usage?days=${days}`),
  agentQuality: (days: number) => api.get<{ since: string; agents: AgentQualityRow[] }>(`/dashboard/agent-quality?days=${days}`),
};
