-- AURA - durable run events (docs/plans/aura-automation-durability.md Part C).
--
-- Agent turns run as background jobs. Every event a client sees (run, text, tool, progress,
-- council, gate, decision, error, done) is written here first, then delivered live. A client that
-- disconnects, or opens the run later, replays from its last event id:
--   GET /runs/:id/events?after=<id>
-- run_steps stays the governance record (what happened); run_events is the client stream.
--
-- INTERRUPTED: the process running a turn stopped mid-turn (restart, crash). The run is never
-- retried automatically, so a step can't run twice; the user continues it with a new message.

alter type public.run_status add value if not exists 'INTERRUPTED';

create table public.run_events (
  id bigserial primary key,
  run_id uuid not null references public.workflow_runs (id) on delete cascade,
  event text not null check (char_length(event) between 1 and 40),
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index run_events_run_idx on public.run_events (run_id, id);

-- No policies on purpose: only the API (service role) reads and writes run events.
alter table public.run_events enable row level security;
