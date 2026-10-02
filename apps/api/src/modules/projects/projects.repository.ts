import { dbError, isUniqueViolation } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";
import type { CreateProjectInput, RepositoryInput } from "./projects.schemas.js";
import type { ProjectRow, RepositoryRow } from "./projects.types.js";

const REPOSITORY_COLUMNS = "id, project_id, provider, owner, name, default_branch, installation_id, created_at";
const PROJECT_COLUMNS = `id, key, name, jira_project_key, created_at, repositories (${REPOSITORY_COLUMNS})`;

export type Inserted<T> = { row: T } | { duplicate: true };

export const projectsRepository = {
  async list(): Promise<ProjectRow[]> {
    const { data, error } = await supabaseAdmin.from("projects").select(PROJECT_COLUMNS).order("key");
    if (error) throw dbError("list projects", error);
    return (data ?? []) as unknown as ProjectRow[];
  },

  async find(id: string): Promise<ProjectRow | null> {
    const { data, error } = await supabaseAdmin.from("projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw dbError("find project", error);
    return (data as unknown as ProjectRow | null) ?? null;
  },

  async memberProjectIds(userId: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin.from("project_members").select("project_id").eq("user_id", userId);
    if (error) throw dbError("list memberships", error);
    return ((data ?? []) as { project_id: string }[]).map((r) => r.project_id);
  },

  async members(projectId: string): Promise<{ user_id: string; created_at: string }[]> {
    const { data, error } = await supabaseAdmin.from("project_members").select("user_id, created_at").eq("project_id", projectId).order("created_at");
    if (error) throw dbError("list project members", error);
    return (data ?? []) as { user_id: string; created_at: string }[];
  },

  async addMember(projectId: string, userId: string, addedBy: string): Promise<boolean> {
    const { error } = await supabaseAdmin.from("project_members").insert({ project_id: projectId, user_id: userId, added_by: addedBy });
    if (isUniqueViolation(error)) return false;
    if (error) throw dbError("add project member", error);
    return true;
  },

  async removeMember(projectId: string, userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId).select("user_id");
    if (error) throw dbError("remove project member", error);
    return (data ?? []).length > 0;
  },

  async findIdByJiraKey(jiraProjectKey: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin.from("projects").select("id").eq("jira_project_key", jiraProjectKey).maybeSingle();
    if (error) throw dbError("find project by Jira key", error);
    return (data as { id: string } | null)?.id ?? null;
  },

  async insert(input: CreateProjectInput, createdBy: string): Promise<Inserted<ProjectRow>> {
    const { data, error } = await supabaseAdmin.from("projects").insert({ key: input.key, name: input.name, jira_project_key: input.jiraProjectKey, created_by: createdBy }).select(PROJECT_COLUMNS).single();
    if (isUniqueViolation(error)) return { duplicate: true };
    if (error) throw dbError("create project", error);
    return { row: data as unknown as ProjectRow };
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from("projects").delete().eq("id", id);
    if (error) throw dbError("delete project", error);
  },

  async insertRepository(projectId: string, input: RepositoryInput, createdBy: string): Promise<Inserted<RepositoryRow>> {
    const { data, error } = await supabaseAdmin
      .from("repositories")
      .insert({ project_id: projectId, provider: input.provider, owner: input.owner, name: input.name, default_branch: input.defaultBranch, installation_id: input.installationId ?? null, created_by: createdBy })
      .select(REPOSITORY_COLUMNS)
      .single();
    if (isUniqueViolation(error)) return { duplicate: true };
    if (error) throw dbError("register repository", error);
    return { row: data as RepositoryRow };
  },

  async removeRepository(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from("repositories").delete().eq("id", id);
    if (error) throw dbError("remove repository", error);
  },

  async findGithubRepositoryId(owner: string, name: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin.from("repositories").select("id").eq("provider", "github").eq("owner", owner).eq("name", name).maybeSingle();
    if (error) throw dbError("find repository", error);
    return (data as { id: string } | null)?.id ?? null;
  },
};
