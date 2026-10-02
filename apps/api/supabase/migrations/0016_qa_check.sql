-- AURA - the AURA QA check per Task (docs/plans/aura-git-control-plane.md step 3.7).
--
-- Gate 3 records which Stories each Task implements (task_stories). QA's scenarios belong to
-- Stories. aura-ci.yml reports each scenario's test result with the CI run; AURA passes the check
-- only when every scenario of the Task's Stories has a passing test. The result is stored on the
-- Task's row (qa_state from migration 0007, plus what was missing or failed) and posted to the
-- pull request as the "AURA QA" commit status.

create table public.task_stories (
  task_key text not null check (task_key ~ '^[A-Z][A-Z0-9_]*-[0-9]+$'),
  story_key text not null check (story_key ~ '^[A-Z][A-Z0-9_]*-[0-9]+$'),
  primary key (task_key, story_key)
);

alter table public.task_stories enable row level security;
create policy "signed-in users read task stories" on public.task_stories for select to authenticated using (true);

alter table public.task_branches
  add column qa_summary jsonb not null default '{}'::jsonb,
  add column qa_updated_at timestamptz;
