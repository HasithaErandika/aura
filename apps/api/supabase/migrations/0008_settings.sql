-- AURA - dashboard settings (docs/plans/aura-automation-durability.md Part A).
--
-- Tunable values that used to live only in .env (Coding Council limits, approval SLA, injection
-- policy, turn timeout). One row per (scope, scope_id, key):
--   global   scope_id null      - Admin → Settings
--   project  scope_id = project - Admin → Settings, one project
--   user     scope_id = user    - Profile → Preferences
-- The most specific value wins (user > project > global > .env > code default). Which keys exist,
-- their bounds and who may set them live in apps/api modules/settings/settings.registry.ts, not
-- here, so a new key needs no migration. Never store secrets in this table.
--
-- Writes go only through the API's service-role client, like every other table.

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'project', 'user')),
  scope_id uuid,
  key text not null check (key ~ '^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$'),
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((scope = 'global') = (scope_id is null)),
  unique nulls not distinct (scope, scope_id, key)
);

create index settings_scope_idx on public.settings (scope, scope_id);

create trigger settings_touch_updated_at
  before update on public.settings
  for each row execute function public.touch_updated_at();

alter table public.settings enable row level security;

-- Global and project settings hold no secrets; any signed-in user may read them. A user's own
-- preferences are readable only by that user.
create policy "signed-in users read shared settings" on public.settings
  for select to authenticated using (scope in ('global', 'project'));
create policy "users read their own preferences" on public.settings
  for select to authenticated using (scope = 'user' and scope_id = auth.uid());
