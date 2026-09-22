import { api } from "../../shared/api/client.ts";
import type { Approval, Run, RunStep } from "../../types/api.ts";

export const runsApi = {
  list: () => api.get<{ runs: Run[] }>("/runs").then((r) => r.runs),
  get: (id: string) => api.get<{ run: Run; steps: RunStep[]; approvals: Approval[] }>(`/runs/${id}`),
};

export interface DockerRun {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  runningFor: string;
  epic?: string;
  task?: string;
  kind?: string;
}

// Which Gate 4/5/7 Docker containers are currently running or recently ran
// (apps/agent-runtime/src/mastra/server/docker-runs-routes.ts) - purely observational.
export const dockerRunsApi = {
  list: (epicKey?: string) => {
    const qs = epicKey ? `?${new URLSearchParams({ epic: epicKey }).toString()}` : "";
    return api.get<{ runs: DockerRun[] }>(`/docker/runs${qs}`).then((r) => r.runs);
  },
};
