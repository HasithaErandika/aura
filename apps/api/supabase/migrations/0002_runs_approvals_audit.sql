-- AURA - governance records for agent runs.
--
-- Conversation history and agent memory stay in the runtime's own storage (Mastra). What the
-- runtime cannot own is the governance record the architecture requires outside the LLM:
--   * workflow_runs / run_steps   what the Orchestrator actually did, per run (FR-AGENT-5)
--   * approval_requests           an independent snapshot of what a human was asked to
--                                 approve, with who may answer (FR-APPR-1/2)
--   * approval_decisions          the recorded human decision, bound to that snapshot's hash
--                                 (FR-APPR-3)
--   * audit_logs                  append-only trail (FR-OBS-3)
-- All writes go through apps/api with the service-role client. RLS is enabled with no client
-- policies, so nothing but the API can read or write these tables.

create type public.run_status as enum (
  'PENDING',
  'RUNNING',
  'SUSPENDED_FOR_APPROVAL',
  'SUCCEEDED',
  'FAILED',
  'REJECTED',
  'EXPIRED',
  'HALTED_LOOP_GUARD'
);

create type public.approval_status as enum (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REVISION_REQUESTED',
  'ANSWERED',
  'EXPIRED'
);

create type public.approval_decision as enum ('approve', 'reject', 'revise', 'answer');

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  thread_id text not null,
  runtime_run_id text,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  requested_by_role public.user_role not null,
  status public.run_status not null default 'PENDING',
  -- the agent the Orchestrator most recently delegated to; drives who may approve next
  current_agent text,
  agents_involved text[] not null default '{}',
  title text,
  input_summary text,
  output_summary text,
  last_error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create index workflow_runs_requested_by_idx on public.workflow_runs (requested_by, started_at desc);
create index workflow_runs_thread_idx on public.workflow_runs (thread_id, started_at desc);
create index workflow_runs_status_idx on public.workflow_runs (status);
create index workflow_runs_current_agent_idx on public.workflow_runs (current_agent) where status = 'SUSPENDED_FOR_APPROVAL';

create table public.run_steps (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.workflow_runs (id) on delete cascade,
  seq integer not null,
  kind text not null check (kind in ('tool-call', 'tool-result', 'tool-error', 'text', 'suspended', 'resumed', 'error', 'finish')),
  tool_name text,
  tool_call_id text,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs (id) on delete cascade,
  thread_id text not null,
  agent_id text not null,
  runtime_run_id text not null,
  tool_call_id text not null,
  -- agent whose output is under review (null for a clarification question to the requester)
  producing_agent text,
  -- role that must answer; null means the requester answers
  required_role public.user_role,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  question text not null,
  options jsonb,
  selection_mode text,
  snapshot text,
  snapshot_hash text not null,
  status public.approval_status not null default 'PENDING',
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);

create index approval_requests_inbox_idx on public.approval_requests (status, required_role, requested_at desc);
create index approval_requests_run_idx on public.approval_requests (run_id);
create index approval_requests_thread_idx on public.approval_requests (thread_id);
create index approval_requests_requester_idx on public.approval_requests (requested_by, status);

create table public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references public.approval_requests (id) on delete cascade,
  decided_by uuid not null references public.profiles (id) on delete restrict,
  decided_by_role public.user_role not null,
  decision public.approval_decision not null,
  answer text,
  reason text,
  snapshot_hash text not null,
  created_at timestamptz not null default now()
);

create index approval_decisions_approval_idx on public.approval_decisions (approval_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_role public.user_role,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- Append-only, enforced in the database as well as by grants: even the service role cannot
-- update or delete a row once written (FR-OBS-3).
create function public.audit_logs_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_append_only();

revoke update, delete on public.audit_logs from anon, authenticated, service_role;

-- keep updated_at honest
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger workflow_runs_touch_updated_at
  before update on public.workflow_runs
  for each row execute function public.touch_updated_at();

alter table public.workflow_runs enable row level security;
alter table public.run_steps enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_decisions enable row level security;
alter table public.audit_logs enable row level security;
-- No policies on purpose: only the API (service role) touches these tables.
