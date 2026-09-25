-- AURA - personal access tokens and per-user git identity.
--
-- Personal access tokens let the `aura` CLI (apps/cli) and the VS Code extension call the API
-- without a browser session - Supabase access tokens expire hourly, which is fine for the web
-- app (it refreshes silently) but not for a terminal tool. Only the SHA-256 hash of a token is
-- stored; the raw value is shown to the user exactly once, at creation. apps/api's
-- middleware/auth.ts resolves an `aura_pat_...` bearer against this table and then applies the
-- exact same profile/role checks as a Supabase session, so a token never grants more than its
-- owner's role (docs/plans/aura-code-cli-council.md section 4.1).

create table public.access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  token_hash text not null unique,
  -- First characters of the token ("aura_pat_AbCd"), so a user can tell tokens apart in the
  -- list without the secret ever being stored or shown again.
  prefix text not null,
  -- "personal": created by the user on the Profile page. "terminal": minted automatically when
  -- the user opens the web terminal, so the `aura` CLI inside it works without `aura login`;
  -- short-lived and hidden from the Profile page's list.
  kind text not null default 'personal' check (kind in ('personal', 'terminal')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index access_tokens_user_idx on public.access_tokens (user_id);

alter table public.access_tokens enable row level security;

-- Self-read only, same pattern as coding_agent_credentials (0004). All writes go through the
-- API's service-role client.
create policy "users read their own tokens"
  on public.access_tokens for select
  using (auth.uid() = user_id);

-- The developer's own git identity, used when AURA commits on their behalf server-side (web
-- Source Control, delegate_to_git after approval) so those commits are authored by the human
-- who approved them rather than the fixed AURA bot identity. The CLI commits locally with the
-- developer's own git config and fills these in at `aura login`. Nullable: AURA falls back to
-- its own identity when unset.
alter table public.profiles add column git_name text check (git_name is null or char_length(git_name) between 1 and 200);
alter table public.profiles add column git_email text check (git_email is null or char_length(git_email) between 3 and 320);
