-- AURA - identity and RBAC.
-- Identity itself is Supabase Auth (auth.users). This is the extension
-- layer this app owns directly: each user's role, since role- and
-- project-based access control lives outside the LLM (docs/ARCHITECTURE.md
-- §4). Agent/run/workflow state is Mastra's domain, not this database,
-- kept out of here until there's an actual plan for how the API and the
-- agent runtime share that data.

create type public.user_role as enum (
  'admin',
  'project_owner',
  'business_analyst',
  'architect',
  'developer',
  'qa_engineer',
  'tester',
  'deployer'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'developer',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- security definer function so the RLS policy below can check "is this
-- caller an admin" without recursively re-triggering RLS on `profiles`.
create function public.current_role() returns public.user_role
language sql security definer stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- every signed-in user can read their own profile (used by the web app to
-- show the current user's role without a round trip through the API).
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- admins can read every profile (Admin/user-management screen).
create policy "admins read all profiles"
  on public.profiles for select
  using (public.current_role() = 'admin');

-- all writes (create/update/delete) go through the API's service-role
-- client only, no direct client-side writes, so no insert/update/delete
-- policy is granted here. This matches the architecture's principle that
-- role grants are deterministic-system-owned, not client-owned.
