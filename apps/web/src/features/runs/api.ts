import { api } from "@/shared/api/client.ts";
import type { Run } from "@/shared/api/types.ts";
import type { RunDetail } from "./types.ts";

export const runsApi = {
  list: () => api.get<{ runs: Run[] }>("/runs?limit=200").then((r) => r.runs),
  get: (id: string) => api.get<RunDetail>(`/runs/${id}`),
  stop: (id: string) => api.post<{ result: unknown }>(`/runs/${id}/stop`),
};
