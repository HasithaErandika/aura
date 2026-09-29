-- AURA - projects, repositories and Task branches (docs/plans/aura-git-control-plane.md §5.1).
--
-- Phase 1 makes Git real: a Project is one Jira project plus the repository its code lives in
-- (ADR-3 D1: one repository per Project for now). Admins register both through apps/api
-- (modules/projects). task_branches and task_dependencies are filled in by later Phase 1 steps
-- (Gate 4 creates the branch, webhooks keep PR/CI state, dependsOn becomes Jira links); they're
-- created here so the whole data model lands in one migration.
--
-- Writes go only through the API's service-role client, like every other table. RLS is on and
-- only lets signed-in users read.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  name text not null check (char_length(name) between 1 and 120),
  -- Ties Jira Epics/Tasks to this Project. One Project per Jira project.
  jira_project_key text not null unique check (jira_project_key ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- github: a GitHub repository reached through the GitHub App. local: a bare repository on the
  -- runtime's disk (<AURA_GIT_LOCAL_ROOT>/<owner>/<name>.git), for tests and offline use.
  provider text not null check (provider in ('github', 'local')),
  owner text not null check (owner ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$'),
  name text not null check (name ~ '^[A-Za-z0-9_.-]{1,100}$' and name not in ('.', '..')),
  default_branch text not null default 'main' check (char_length(default_branch) between 1 and 255),
  -- GitHub App installation; null for local repositories.
  installation_id bigint,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (provider, owner, name),
  check (provider = 'github' or installation_id is null)
);

-- ADR-3 D1: one repository per Project in Phase 1. Dropping this index is the multi-repo change.
create unique index repositories_one_per_project on public.repositories (project_id);

create table public.task_branches (
  task_key text primary key,             -- Jira Task key
  repository_id uuid not null references public.repositories (id) on delete cascade,
  branch text not null,                  -- feature/<TASK>
  base_sha text not null,
  pr_number integer,
  pr_state text check (pr_state in ('open', 'merged', 'closed')),
  head_sha text,
  ci_state text check (ci_state in ('pending', 'success', 'failure')),
  qa_state text check (qa_state in ('pending', 'success', 'failure')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index task_branches_repository_idx on public.task_branches (repository_id);

create trigger task_branches_touch_updated_at
  before update on public.task_branches
  for each row execute function public.touch_updated_at();

create table public.task_dependencies (
  task_key text not null,
  depends_on text not null,
  primary key (task_key, depends_on),
  check (task_key <> depends_on)
);

alter table public.projects enable row level security;
alter table public.repositories enable row level security;
alter table public.task_branches enable row level security;
alter table public.task_dependencies enable row level security;

create policy "signed-in users read projects" on public.projects for select to authenticated using (true);
create policy "signed-in users read repositories" on public.repositories for select to authenticated using (true);
create policy "signed-in users read task branches" on public.task_branches for select to authenticated using (true);
create policy "signed-in users read task dependencies" on public.task_dependencies for select to authenticated using (true);

-- ADR-3 D6 removed the Claude Code / Codex providers in Phase 0; nothing reads this table any more.
drop table if exists public.coding_agent_credentials;
