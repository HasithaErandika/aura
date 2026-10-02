import { env } from "../../config/env.js";
import { conflict, notFound } from "../../lib/http/errors.js";
import { TtlCache } from "../../lib/ttl-cache.js";
import { projectsRepository } from "./projects.repository.js";
import type { CreateProjectInput, RepositoryInput } from "./projects.schemas.js";
import { toProjectView, toRepositoryView, type ProjectView, type RepositoryView } from "./projects.types.js";

const CURRENT_PROJECT_CACHE_MS = 60_000;
const currentProjectCache = new TtlCache<string | null>(CURRENT_PROJECT_CACHE_MS, 1);

export async function listProjects(): Promise<ProjectView[]> {
  return (await projectsRepository.list()).map(toProjectView);
}

async function getProject(id: string): Promise<ProjectView> {
  const row = await projectsRepository.find(id);
  if (!row) throw notFound("Project");
  return toProjectView(row);
}

export async function createProject(input: CreateProjectInput, createdBy: string): Promise<ProjectView> {
  const inserted = await projectsRepository.insert(input, createdBy);
  if ("duplicate" in inserted) throw conflict(`A project with key ${input.key} or Jira project ${input.jiraProjectKey} already exists`);
  currentProjectCache.delete("current");
  return toProjectView(inserted.row);
}

export async function deleteProject(id: string): Promise<ProjectView> {
  const project = await getProject(id);
  await projectsRepository.remove(id);
  currentProjectCache.delete("current");
  return project;
}

export async function setRepository(projectId: string, input: RepositoryInput, createdBy: string): Promise<RepositoryView> {
  const project = await getProject(projectId);
  if (project.repository) throw conflict(`${project.key} already has a repository (${project.repository.fullName}); remove it first`);
  const inserted = await projectsRepository.insertRepository(projectId, input, createdBy);
  if ("duplicate" in inserted) throw conflict(`${input.owner}/${input.name} is already registered to a project`);
  return toRepositoryView(inserted.row);
}

export async function removeRepository(projectId: string): Promise<RepositoryView> {
  const project = await getProject(projectId);
  if (!project.repository) throw notFound("Repository");
  await projectsRepository.removeRepository(project.repository.id);
  return project.repository;
}

export async function assertProjectExists(id: string): Promise<void> {
  if (!(await projectsRepository.find(id))) throw notFound("Project");
}

// Until runs carry a project, a turn belongs to the project registered for JIRA_PROJECT_KEY.
export async function currentProjectId(): Promise<string | null> {
  const jiraKey = env.jiraProjectKey;
  if (!jiraKey) return null;
  return currentProjectCache.getOrLoad("current", () => projectsRepository.findIdByJiraKey(jiraKey));
}

export async function githubRepositoryId(fullName: string | null): Promise<string | null> {
  const [owner, name, extra] = fullName?.split("/") ?? [];
  if (!owner || !name || extra !== undefined) return null;
  return projectsRepository.findGithubRepositoryId(owner, name);
}
