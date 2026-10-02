-- AURA - project membership (docs/plans/aura-git-control-plane.md step 4.1).
--
-- People see and work on only the projects they are members of; admins see every project. apps/api
-- enforces it on every project route (modules/projects, policy.ts canUseProject). The policies
-- below apply the same rule to direct reads with a user's session, so the database never shows a
-- project's rows to a non-member even if a client queries it.

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_members_user_idx on public.project_members (user_id);

alter table public.project_members enable row level security;
create policy "users read their own memberships" on public.project_members for select to authenticated using (user_id = auth.uid());

-- Runs remember their project, so access never depends on the API's current setting.
alter table public.workflow_runs add column project_id uuid references public.projects (id) on delete set null;
create index workflow_runs_project_idx on public.workflow_runs (project_id, started_at desc);

-- Admin or member of the project. security definer so policies can call it without recursing.
create function public.can_use_project(target uuid) returns boolean
language sql security definer stable
set search_path = public
as $$
  select public.current_role() = 'admin'
      or exists (select 1 from public.project_members m where m.project_id = target and m.user_id = auth.uid());
$$;

drop policy "signed-in users read projects" on public.projects;
create policy "members read their projects" on public.projects for select to authenticated using (public.can_use_project(id));

drop policy "signed-in users read repositories" on public.repositories;
create policy "members read their repositories" on public.repositories for select to authenticated using (public.can_use_project(project_id));

drop policy "signed-in users read task branches" on public.task_branches;
create policy "members read their task branches" on public.task_branches for select to authenticated
  using (repository_id is not null and public.can_use_project((select r.project_id from public.repositories r where r.id = repository_id)));

drop policy "signed-in users read shared settings" on public.settings;
create policy "members read shared settings" on public.settings for select to authenticated
  using (scope = 'global' or (scope = 'project' and public.can_use_project(scope_id)));

-- Everyone who works today keeps working: existing users join existing projects.
insert into public.project_members (project_id, user_id)
select p.id, pr.id from public.projects p cross join public.profiles pr where pr.role <> 'admin'
on conflict do nothing;
