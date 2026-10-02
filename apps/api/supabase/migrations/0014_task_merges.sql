-- AURA - merge tracking per Task (docs/plans/aura-git-control-plane.md steps 3.2 and 3.3).
--
-- The GitHub webhook (POST /webhooks/github, migration 0013) reports pull request events. When a
-- person merges a Task's PR, task_branches records when and which commit; the Task's Jira status
-- moves on, and QA and the developer are notified (pr_merged).

alter table public.task_branches
  add column merged_at timestamptz,
  add column merge_sha text check (merge_sha ~ '^[0-9a-f]{7,64}$');

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('pr_opened', 'pr_merged', 'ci_passed', 'ci_failed'));
