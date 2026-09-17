import { api } from "../../shared/api/client.ts";
import type { DashboardSummary } from "../../types/api.ts";

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>("/dashboard/summary"),
};
