-- AURA - remove the human "tester" role.
--
-- qa_engineer already had run+approve access to everything tester-agent does (policy.ts's
-- ROLE_AGENT_GRANTS before this change) - "tester" only let a second person trigger Gate 7
-- without being able to approve it, a segregation-of-duties split this org no longer wants.
-- Gate 7 itself is being replaced by a bounded Tester Agent loop (test -> diagnose -> route to
-- Dev/QA -> retest -> HALTED_LOOP_GUARD after 3 attempts) that qa_engineer alone starts and
-- oversees - see workflows/tester-workflow.ts. No functional loss: every 'tester' user becomes
-- 'qa_engineer'.

-- 1) Decouple the append-only audit trail from the mutable role enum FIRST. A historical
-- actor_role is a fact about what happened; it must survive future role changes verbatim, in
-- plain text, not as a live enum value this migration is about to redefine out from under it.
-- audit_logs' own append-only trigger only fires on UPDATE/DELETE of rows, not on this column
-- type change, but the column must still never again depend on a mutable role enum - lesson
-- learned from this exact migration having to touch it once already.
alter table public.audit_logs alter column actor_role type text;

-- 2) Reassign existing tester-role people and historical operational records to qa_engineer.
-- workflow_runs/approval_requests/approval_decisions record who was ALLOWED to act on a run,
-- not an append-only evidence ledger (that's audit_logs, decoupled above) - remapping them here
-- keeps these tables valid against the narrowed enum without losing meaning.
update public.profiles set role = 'qa_engineer' where role = 'tester';
update public.workflow_runs set requested_by_role = 'qa_engineer' where requested_by_role = 'tester';
update public.approval_requests set required_role = 'qa_engineer' where required_role = 'tester';
update public.approval_decisions set decided_by_role = 'qa_engineer' where decided_by_role = 'tester';

-- 3) Recreate user_role without 'tester'. Postgres has no ALTER TYPE ... DROP VALUE, so the
-- type must be rebuilt and every column/function/policy that depends on it repointed.
drop policy "admins read all profiles" on public.profiles;
drop function public.current_role();

alter type public.user_role rename to user_role_old;
create type public.user_role as enum (
  'admin', 'project_owner', 'business_analyst', 'architect', 'developer', 'qa_engineer', 'deployer'
);

alter table public.profiles alter column role type public.user_role using role::text::public.user_role;
alter table public.profiles alter column role set default 'developer';
alter table public.workflow_runs alter column requested_by_role type public.user_role using requested_by_role::text::public.user_role;
alter table public.approval_requests alter column required_role type public.user_role using required_role::text::public.user_role;
alter table public.approval_decisions alter column decided_by_role type public.user_role using decided_by_role::text::public.user_role;

drop type public.user_role_old;

create function public.current_role() returns public.user_role
language sql security definer stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create policy "admins read all profiles"
  on public.profiles for select
  using (public.current_role() = 'admin');

-- Run this against a copy of production data first: the enum rebuild and the audit_logs column
-- type change both rewrite whole tables and cannot be undone by re-running this file.
