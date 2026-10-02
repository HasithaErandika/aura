import { api } from "@/shared/api/client.ts";
import type { Project, ProjectMember, Repository, RepositoryProvider } from "../types.ts";

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
  members: (id: string) => api.get<{ members: ProjectMember[] }>(`/projects/${id}/members`).then((r) => r.members),
  addMember: (id: string, userId: string) => api.post<{ added: boolean }>(`/projects/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) => api.delete<void>(`/projects/${id}/members/${userId}`),
};
