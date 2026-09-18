-- AURA - coding-agent credentials.
-- Each user connects their own API key for the coding CLI they want AURA's
-- Coding Agent (delegate_to_code, Gate 5, docs/ARCHITECTURE.md §6.4/6.5) to
-- run on their behalf inside the Docker sandbox - Claude Code (Anthropic)
-- or Codex (OpenAI). Keys are encrypted at rest (apps/api/src/lib/crypto.ts,
-- AES-256-GCM, key from CREDENTIALS_ENCRYPTION_KEY) before they ever reach
-- this table, and only apps/api's service-role client ever reads or writes
-- it - apps/agent-runtime has no Supabase access of its own and fetches a
-- decrypted key just-in-time over a narrow internal HTTP call instead of
-- duplicating this trust boundary (see delegate-tools.ts's `delegate_to_code`).

create table public.coding_agent_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai')),
  encrypted_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.coding_agent_credentials enable row level security;

-- Self-read only, for consistency with `profiles` (0001_identity.sql) - real
-- enforcement of "your own credentials only" is in apps/api's service-role
-- code (currentUser(req).id), same as everywhere else in this schema.
create policy "users read their own credentials"
  on public.coding_agent_credentials for select
  using (auth.uid() = user_id);

-- All writes (create/update/delete) go through the API's service-role
-- client only, same reasoning as `profiles`: no insert/update/delete policy
-- is granted here.
