import { api } from "@/shared/api/client.ts";
import type { DashboardSummary } from "./types.ts";

export const dashboardApi = {
  summary: () => api.get<DashboardSummary>("/dashboard/summary"),
};
