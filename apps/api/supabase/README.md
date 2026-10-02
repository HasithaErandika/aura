# AURA database design

Two layers, two owners:

| Owner | Data | Where |
|---|---|---|
| Runtime (Mastra, `apps/agent-runtime`) | Conversation threads, messages, agent memory, the suspended workflow snapshot | Runtime storage (`mastra.db` locally) |
| API (`apps/api`) | Identity and roles, the governance record of every run, approval requests and decisions, the audit trail | This Supabase project |

The Orchestrator decides what happens in a run. The API only records what it observed and who decided what, so the human gate is a durable record outside the LLM ([docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)).

| Migration | Creates |
|---|---|
| `0001_identity.sql` | `user_role` enum, `profiles` (+ RLS), `current_role()` helper |
| `0002_runs_approvals_audit.sql` | `workflow_runs`, `run_steps`, `approval_requests`, `approval_decisions`, `audit_logs` (append-only, trigger enforced) |
| `0003_run_step_progress_kind.sql` | `progress` kind for run steps |
| `0004_coding_agent_credentials.sql` | Coding-agent credentials (dropped again by 0007) |
| `0005_remove_tester_role.sql` | Removes the human Tester role |
| `0006_access_tokens_git_identity.sql` | `access_tokens`; `git_name` / `git_email` on `profiles` |
| `0009_run_events.sql` | `run_events` (client stream of every turn), run status `INTERRUPTED` |
| `0008_settings.sql` | `settings` (global, project and user values for the dashboard) |
| `0007_projects_repositories.sql` | `projects`, `repositories` (one per project), `task_branches`, `task_dependencies`; drops `coding_agent_credentials` |

Apply them in order in the Supabase SQL editor. Every table has RLS enabled and no client policies except the two read policies on `profiles`; all writes go through the API's service-role client.

## Growing this schema

Add a new `NNNN_description.sql` for a concrete need. Do not mirror runtime state (threads, messages, memory) here; reference it by id (`thread_id`, `runtime_run_id`) instead.
