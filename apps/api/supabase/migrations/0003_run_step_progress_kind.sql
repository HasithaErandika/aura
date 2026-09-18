-- Adds 'progress' to run_steps.kind: sub-step progress reported by a workflow-backed delegate
-- tool (e.g. the Architect Workflow's per-section steps), relayed through the same tool-call
-- stream as a transient custom chunk and mirrored here exactly like any other step
-- (docs/ARCHITECTURE.md section 6.3). Postgres names an inline column check constraint
-- <table>_<column>_check by default.

alter table public.run_steps drop constraint run_steps_kind_check;

alter table public.run_steps add constraint run_steps_kind_check
  check (kind in ('tool-call', 'tool-result', 'tool-error', 'text', 'suspended', 'resumed', 'error', 'finish', 'progress'));
