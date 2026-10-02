-- AURA - notes to a running Task (docs/plans/aura-vscode-agents.md V4, plan §3: "the developer
-- can type at any time: a note goes to the running agents").
--
-- The developer types while the coders work; the note is stored here and the runtime picks it
-- up between coder and Evaluator steps (GET /internal/runs/:id/notes), which marks it delivered.

create table public.run_notes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  text text not null check (char_length(text) between 1 and 4000),
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index run_notes_pending_idx on public.run_notes (run_id, created_at) where delivered_at is null;

alter table public.run_notes enable row level security;
-- No policies: only the API (service role) reads and writes notes.
