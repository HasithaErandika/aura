import { api } from "../../shared/api/client.ts";
import type { RegistryAgent } from "../../types/api.ts";

export const registryApi = {
  list: () => api.get<{ agents: RegistryAgent[] }>("/agents").then((r) => r.agents),
};
