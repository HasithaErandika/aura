import { api } from "../../shared/api/client.ts";
import type { Approval, Run, RunStep } from "../../types/api.ts";

export const runsApi = {
  list: () => api.get<{ runs: Run[] }>("/runs").then((r) => r.runs),
  get: (id: string) => api.get<{ run: Run; steps: RunStep[]; approvals: Approval[] }>(`/runs/${id}`),
};
