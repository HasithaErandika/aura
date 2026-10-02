import { env } from "../../config/env.js";
import type { AuthedUser } from "../../lib/auth/user.js";
import { conflict, forbidden, notFound } from "../../lib/http/errors.js";
import { peopleById } from "../identity/index.js";
import { canUseProject } from "../policy/index.js";
import { TtlCache } from "../../lib/ttl-cache.js";
import { projectsRepository } from "./projects.repository.js";
import type { CreateProjectInput, RepositoryInput } from "./projects.schemas.js";
import { toProjectView, toRepositoryView, type ProjectView, type RepositoryView } from "./projects.types.js";

const CURRENT_PROJECT_CACHE_MS = 60_000;
const currentProjectCache = new TtlCache<string | null>(CURRENT_PROJECT_CACHE_MS, 1);

const MEMBERSHIP_CACHE_MS = 30_000;
const memberships = new TtlCache<Set<string>>(MEMBERSHIP_CACHE_MS, 5_000);

function memberOf(userId: string): Promise<Set<string>> {
  return memberships.getOrLoad(userId, async () => new Set(await projectsRepository.memberProjectIds(userId)));
}

// Admins see every project; everyone else the projects they are members of.
export async function listProjects(user: Pick<AuthedUser, "id" | "role">): Promise<ProjectView[]> {
  const all = (await projectsRepository.list()).map(toProjectView);
  if (user.role === "admin") return all;
  const mine = await memberOf(user.id);
  return all.filter((p) => mine.has(p.id));
}

// Project routes (runs, approvals, design documents, Task PRs, Jira, agents, the bridge) belong to
// the current project: only its members and admins use them (step 4.1).
export async function assertProjectAccess(user: Pick<AuthedUser, "id" | "role">): Promise<void> {
  const projectId = await currentProjectId();
  if (canUseProject(user, projectId, projectId && user.role !== "admin" ? await memberOf(user.id) : new Set())) return;
  throw forbidden("You are not a member of this project. Ask an admin to add you (Admin → Projects & Repositories).");
}

export interface MemberView {
  userId: string;
  email: string | null;
  fullName: string | null;
  addedAt: string;
}

export async function listMembers(projectId: string): Promise<MemberView[]> {
  await getProject(projectId);
  const rows = await projectsRepository.members(projectId);
  const person = await peopleById(rows.map((r) => r.user_id));
  return rows.map((r) => ({ userId: r.user_id, email: person(r.user_id)?.email ?? null, fullName: person(r.user_id)?.fullName ?? null, addedAt: r.created_at }));
}

export async function addMember(projectId: string, userId: string, addedBy: string): Promise<boolean> {
  await getProject(projectId);
  if (!(await peopleById([userId]))(userId)) throw notFound("User");
  const added = await projectsRepository.addMember(projectId, userId, addedBy);
  memberships.delete(userId);
  return added;
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  await getProject(projectId);
  if (!(await projectsRepository.removeMember(projectId, userId))) throw notFound("Project member");
  memberships.delete(userId);
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
