-- AURA - pull requests and CI per Task, and in-app notifications (docs/plans/aura-vscode-agents.md
-- V6, plan §10 and "Web app after this change").
--
-- Gate 6 opens the Task's pull request from the developer's machine; apps/api records it in
-- task_branches (migration 0007). The project's aura-ci.yml reports each CI run to
-- POST /ci/report with a GitHub Actions OIDC token, which updates the same row. QA follows the
-- PR and CI on the QA page and is notified when a PR opens or CI finishes.

-- A Task's PR can be recorded before its repository is registered in AURA: the repository is then
-- known by its GitHub name only.
alter table public.task_branches alter column repository_id drop not null;

alter table public.task_branches
  add column epic_key text check (epic_key ~ '^[A-Z][A-Z0-9_]*-[0-9]+$'),
  add column repo_full_name text check (repo_full_name ~ '^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9_.-]+$'),
  add column pr_url text check (pr_url ~ '^https://'),
  add column pr_title text check (char_length(pr_title) <= 300),
  add column reviewers text[] not null default '{}',
  add column opened_by uuid references auth.users (id) on delete set null,
  add column run_id uuid references public.workflow_runs (id) on delete set null,
  add column ci_url text check (ci_url ~ '^https://'),
  add column ci_summary jsonb not null default '{}'::jsonb,
  add column ci_updated_at timestamptz;

-- CI also reports a run in progress and a cancelled one.
alter table public.task_branches drop constraint task_branches_ci_state_check;
alter table public.task_branches
  add constraint task_branches_ci_state_check check (ci_state in ('pending', 'running', 'success', 'failure', 'cancelled'));

create index task_branches_epic_idx on public.task_branches (epic_key, updated_at desc);
create index task_branches_repo_branch_idx on public.task_branches (repo_full_name, branch);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('pr_opened', 'ci_passed', 'ci_failed')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 2000),
  link text check (char_length(link) <= 500),
  task_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
-- No policies: only the API (service role) reads and writes notifications.
