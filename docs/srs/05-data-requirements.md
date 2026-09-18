# SRS — 05. Data Requirements

## 1. Core data domains

| Domain | Tables | Notes |
|---|---|---|
| `identity` | organizations, regions, users, memberships, roles, role_agent_grants | SSO-federated identity and RBAC |
| `registry` | agents, agent_versions, prompts, tools, agent_tool_grants, risk_tiers | Versioned, declarative agent definitions |
| `projects` | projects, jira_project_links, environments | Maps AURA projects to Jira projects and deploy environments |
| `runs` | workflow_runs, run_steps, tool_calls, run_costs | Full execution trace per run |
| `approvals` | approval_requests, approval_decisions | Independent record of what was approved, with payload snapshot |
| `artifacts` | documents, adrs, requirements, test_plans, test_suites, test_results, releases | Agent-produced and CI-produced outputs |
| `memory` | embeddings (pgvector) | Scoped by `project_id`, used for RAG |
| `governance` | audit_logs (append-only), policy_versions | Immutable audit trail |

Full ERD: [../ARCHITECTURE.md §4.1](../ARCHITECTURE.md#41-entities); schema listing: [../ARCHITECTURE.md §9.1](../ARCHITECTURE.md#91-core-schema-supabase-postgres-rls-on-every-table).

### Tables in place (2026-09-18)

| Owner | Store | Contents |
|---|---|---|
| `apps/api` (Supabase) | `profiles` | identity and role |
| `apps/api` (Supabase) | `workflow_runs`, `run_steps` | one row per agent turn and every observed delegation, tool result, pause, resume, and finish |
| `apps/api` (Supabase) | `approval_requests`, `approval_decisions` | what a human was asked, the exact snapshot and its hash, who answered and how |
| `apps/api` (Supabase) | `audit_logs` | append-only, enforced by trigger |
| `apps/agent-runtime` (libSQL) | Mastra memory | conversation threads and messages, suspended run snapshots |
| `apps/agent-runtime` (libSQL) | `aura_drafts` | structured Epic, Story, and Architecture drafts by id, version chain, Jira keys filed per item |
| `apps/agent-runtime` (filesystem) | Architect workspace | per-Epic ADRs, requirements summary, `architecture.md`, `plan.md` — not a Supabase table, viewable read-only from the web app |

Supabase rows reference runtime state by id (`thread_id`, `runtime_run_id`, draft ids in step payloads); runtime state is never copied into Supabase.

## 2. Row-level security

- Every row carries `org_id`, `region_id`, `project_id`.
- JWT custom claims (`org_id`, `roles[]`, `project_ids[]`) drive RLS policies at the database layer.
- `audit_logs` grants no `UPDATE`/`DELETE` to any role, including the service role, in production — insert-only, permanently.

## 3. Data residency (multi-region)

- Regions at launch: EU, APAC, US.
- Project data, embeddings, artifacts, and LLM calls stay within the project's assigned region; EU data must never leave EU endpoints.
- Agent definitions and policy templates are global; grants are applied regionally.
- A global control plane (corporate IdP + registry directory/policy templates) synchronizes policy templates to each region without moving project data across regions.

## 4. Retention

- Test evidence (traces, screenshots, logs) retained per regional policy, linked from the originating Jira issue.
- Structured logs are PII-redacted before retention.
- Audit logs are retained indefinitely (append-only) to support compliance evidence export.

## 5. Provenance

Every artifact an agent creates records: agent name and version, prompt version, model + version, run ID, trace ID, source Jira issue, and approver identity + timestamp (see the provenance stamp format in [../ARCHITECTURE.md §7](../ARCHITECTURE.md#7-tool-gateway)).
