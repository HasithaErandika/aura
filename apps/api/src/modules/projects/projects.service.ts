import { supabaseAdmin } from "../../lib/supabase.js";
import { conflict, notFound, upstreamError } from "../../lib/http/errors.js";
import type { CreateProjectInput, RepositoryInput } from "./projects.schemas.js";

// Projects and their repository (supabase/migrations/0007_projects_repositories.sql). One
// repository per Project in Phase 1 (ADR-3 D1).

interface RepositoryRow {
  id: string;
  project_id: string;
  provider: "github" | "local";
  owner: string;
  name: string;
  default_branch: string;
  installation_id: number | null;
  created_at: string;
}

interface ProjectRow {
  id: string;
  key: string;
  name: string;
  jira_project_key: string;
  created_at: string;
  repositories: RepositoryRow[] | null;
}

export interface RepositoryView {
  id: string;
  provider: "github" | "local";
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  installationId: number | null;
  createdAt: string;
}

export interface ProjectView {
  id: string;
  key: string;
  name: string;
  jiraProjectKey: string;
  createdAt: string;
  repository: RepositoryView | null;
}

const PROJECT_COLUMNS = "id, key, name, jira_project_key, created_at, repositories (id, project_id, provider, owner, name, default_branch, installation_id, created_at)";
const REPOSITORY_COLUMNS = "id, project_id, provider, owner, name, default_branch, installation_id, created_at";

function toRepositoryView(row: RepositoryRow): RepositoryView {
  return {
    id: row.id,
    provider: row.provider,
    owner: row.owner,
    name: row.name,
    fullName: `${row.owner}/${row.name}`,
    defaultBranch: row.default_branch,
    installationId: row.installation_id,
    createdAt: row.created_at,
  };
}

function toProjectView(row: ProjectRow): ProjectView {
  const repo = row.repositories?.[0];
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    jiraProjectKey: row.jira_project_key,
    createdAt: row.created_at,
    repository: repo ? toRepositoryView(repo) : null,
  };
}

// Postgres unique_violation. Turned into a 409 that says which value is taken.
function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function listProjects(): Promise<ProjectView[]> {
  const { data, error } = await supabaseAdmin.from("projects").select(PROJECT_COLUMNS).order("key");
  if (error) throw upstreamError(error.message);
  return ((data ?? []) as unknown as ProjectRow[]).map(toProjectView);
}

export async function getProject(id: string): Promise<ProjectView> {
  const { data, error } = await supabaseAdmin.from("projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw upstreamError(error.message);
  if (!data) throw notFound("Project");
  return toProjectView(data as unknown as ProjectRow);
}

export async function createProject(input: CreateProjectInput, createdBy: string): Promise<ProjectView> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .insert({ key: input.key, name: input.name, jira_project_key: input.jiraProjectKey, created_by: createdBy })
    .select(PROJECT_COLUMNS)
    .single();
  if (isUniqueViolation(error)) throw conflict(`A project with key ${input.key} or Jira project ${input.jiraProjectKey} already exists`);
  if (error || !data) throw upstreamError(error?.message ?? "Could not create the project");
  return toProjectView(data as unknown as ProjectRow);
}

export async function deleteProject(id: string): Promise<ProjectView> {
  const project = await getProject(id);
  const { error } = await supabaseAdmin.from("projects").delete().eq("id", id);
  if (error) throw upstreamError(error.message);
  return project;
}

export async function setRepository(projectId: string, input: RepositoryInput, createdBy: string): Promise<RepositoryView> {
  const project = await getProject(projectId);
  if (project.repository) throw conflict(`${project.key} already has a repository (${project.repository.fullName}); remove it first`);
  const { data, error } = await supabaseAdmin
    .from("repositories")
    .insert({
      project_id: projectId,
      provider: input.provider,
      owner: input.owner,
      name: input.name,
      default_branch: input.defaultBranch,
      installation_id: input.installationId ?? null,
      created_by: createdBy,
    })
    .select(REPOSITORY_COLUMNS)
    .single();
  if (isUniqueViolation(error)) throw conflict(`${input.owner}/${input.name} is already registered to a project`);
  if (error || !data) throw upstreamError(error?.message ?? "Could not register the repository");
  return toRepositoryView(data as RepositoryRow);
}

export async function removeRepository(projectId: string): Promise<RepositoryView> {
  const project = await getProject(projectId);
  if (!project.repository) throw notFound("Repository");
  const { error } = await supabaseAdmin.from("repositories").delete().eq("id", project.repository.id);
  if (error) throw upstreamError(error.message);
  return project.repository;
}
