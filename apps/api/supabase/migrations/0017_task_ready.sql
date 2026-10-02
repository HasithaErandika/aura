-- AURA - Jira events offer a Task's work (docs/plans/aura-git-control-plane.md step 3.8).
--
-- A Jira Task moved into the configured status, or given the configured label, notifies its
-- assignee (task_ready); their VS Code then offers Start Work. Nothing starts without them.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('task_ready', 'pr_opened', 'pr_merged', 'ci_passed', 'ci_failed'));
