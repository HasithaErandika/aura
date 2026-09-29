import { api } from "../../../shared/api/client.ts";
import type { Project, Repository, RepositoryProvider } from "../../../types/api.ts";

export interface RepositoryInput {
  provider: RepositoryProvider;
  owner: string;
  name: string;
  defaultBranch: string;
  installationId?: number;
}

export const projectsApi = {
  list: () => api.get<{ projects: Project[] }>("/projects").then((r) => r.projects),
  create: (body: { key: string; name: string; jiraProjectKey: string }) => api.post<Project>("/projects", body),
  remove: (id: string) => api.delete<void>(`/projects/${id}`),
  setRepository: (id: string, body: RepositoryInput) => api.put<Repository>(`/projects/${id}/repository`, body),
  removeRepository: (id: string) => api.delete<void>(`/projects/${id}/repository`),
};
