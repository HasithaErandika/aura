-- AURA - design documents in Postgres (docs/plans/aura-vscode-agents.md V3, ADR-4).
--
-- The Architect's architecture plan, SRS, delivery plan and ADRs, and QA's test plan and
-- scenarios, per Epic. They used to be Markdown files under .workspaces/<EPIC>/; AURA in the
-- cloud now holds no files, so they live here, versioned:
--   design_documents          one row per document: Epic, kind, slug (its stable name), title
--   design_document_versions  every saved version, append-only (content, who or which agent)
--
-- Agents write through the API's internal route after a gate is approved; people edit in the
-- web app (Architect: architecture, SRS, plan, ADRs; QA: test plan and scenarios). Who may edit
-- what is decided in apps/api modules/policy/policy.ts, not here.

create table public.design_documents (
  id uuid primary key default gen_random_uuid(),
  epic_key text not null check (epic_key ~ '^[A-Z][A-Z0-9_]*-[0-9]+$'),
  kind text not null check (kind in ('architecture', 'srs', 'plan', 'adr', 'qa-plan', 'qa-scenario')),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9/_.-]{0,199}$'),
  title text not null check (char_length(title) between 1 and 300),
  -- The Story or Task a QA document is about, when it is about one.
  issue_key text check (issue_key is null or issue_key ~ '^[A-Z][A-Z0-9_]*-[0-9]+$'),
  current_version integer not null default 1 check (current_version >= 1),
  created_by uuid references auth.users (id) on delete set null,
  created_by_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (epic_key, slug)
);

create index design_documents_epic_idx on public.design_documents (epic_key, kind);

create trigger design_documents_touch_updated_at
  before update on public.design_documents
  for each row execute function public.touch_updated_at();

create table public.design_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.design_documents (id) on delete restrict,
  version integer not null check (version >= 1),
  content text not null check (char_length(content) <= 500000),
  content_sha256 text not null,
  author_id uuid references auth.users (id) on delete set null,
  author_agent text,
  note text check (note is null or char_length(note) <= 500),
  -- The approved draft an agent's version came from (provenance).
  draft_id text,
  created_at timestamptz not null default now(),
  unique (document_id, version),
  check (author_id is not null or author_agent is not null)
);

-- A saved version is history: never changed or removed.
create function public.design_document_versions_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'design_document_versions is append-only';
end;
$$;

create trigger design_document_versions_no_update_delete
  before update or delete on public.design_document_versions
  for each row execute function public.design_document_versions_append_only();

revoke update, delete on public.design_document_versions from anon, authenticated, service_role;

-- Reads and writes go through the API's service-role client; no direct client access.
alter table public.design_documents enable row level security;
alter table public.design_document_versions enable row level security;
