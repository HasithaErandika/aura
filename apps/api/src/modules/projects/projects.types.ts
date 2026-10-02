type RepositoryProvider = "github" | "local";

export interface RepositoryRow {
  id: string;
  project_id: string;
  provider: RepositoryProvider;
  owner: string;
  name: string;
  default_branch: string;
  installation_id: number | null;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  key: string;
  name: string;
  jira_project_key: string;
  created_at: string;
  repositories: RepositoryRow[] | null;
}

export interface RepositoryView {
  id: string;
  provider: RepositoryProvider;
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

export function toRepositoryView(row: RepositoryRow): RepositoryView {
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

export function toProjectView(row: ProjectRow): ProjectView {
  const repo = row.repositories?.[0];
  return { id: row.id, key: row.key, name: row.name, jiraProjectKey: row.jira_project_key, createdAt: row.created_at, repository: repo ? toRepositoryView(repo) : null };
}
