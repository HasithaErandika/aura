# SRS — 03. Non-Functional Requirements

## 1. Security

| ID | Requirement |
|---|---|
| NFR-SEC-1 | No secret values shall appear in prompts, logs, or agent memory; the runtime shall receive short-lived, scoped tokens per run. |
| NFR-SEC-2 | Tools classified `FORBIDDEN` (delete projects, modify policy/grants, alter audit logs, read secret values) shall not be callable by any agent under any grant. |
| NFR-SEC-3 | HIGH-risk tools (production deploy, destructive DB operations, secret/config changes, merges to protected branches, external communications) shall require human approval plus four-eyes, and optionally a change-window check. |
| NFR-SEC-4 | Sandboxed agent code execution shall run in ephemeral containers with no network access except allow-listed package registries, and never on shared infrastructure. |
| NFR-SEC-5 | Row-Level Security shall enforce project/org/region scope at the database layer, independent of any application-layer bug. |

## 2. Reliability & Resilience

| ID | Requirement |
|---|---|
| NFR-REL-1 | The event bus shall provide durable, at-least-once delivery between the API and the Agent Runtime; handlers shall be idempotent. |
| NFR-REL-2 | On external outage (Jira, Git, or LLM provider), the system shall apply circuit breakers, exponential backoff, and model fallback, leaving the run `RUNNING` and resumable rather than failed. |
| NFR-REL-3 | Runs shall be resumable and idempotent across restarts of the Agent Runtime. |
| NFR-REL-4 | Cascading hallucination risk shall be bounded by construction: agents may consume only upstream artifacts with `status = Approved`. |

## 3. Cost & Resource Control

| ID | Requirement |
|---|---|
| NFR-COST-1 | Every agent version shall declare `max_tokens_per_run`, `max_cost_usd_per_run`, `max_tool_calls`, and `max_iterations`; the Tool Gateway shall hard-stop on breach, not merely warn. |
| NFR-COST-2 | Per-project daily cost budgets shall be enforced in addition to per-run budgets. |
| NFR-COST-3 | Cost per run/project/region shall be visible on a spend dashboard. |

## 4. Scalability & Multi-tenancy

| ID | Requirement |
|---|---|
| NFR-SCALE-1 | The platform shall support multiple organizations, each spanning multiple regions and projects, from initial release. |
| NFR-SCALE-2 | The API and Agent Runtime shall be independently scalable services so that bursty, long-running agent work never blocks or crashes the API. |
| NFR-SCALE-3 | `api` and `agent-runtime` shall support blue/green or canary deployment with automatic rollback on health-check failure. |

## 5. Data Residency & Compliance

| ID | Requirement |
|---|---|
| NFR-COMP-1 | Project data, embeddings, artifacts, and LLM calls shall stay within the project's assigned region (EU, APAC, US at initial launch). |
| NFR-COMP-2 | Agent definitions and policy templates shall be global; grants shall be regional. |
| NFR-COMP-3 | Structured logs shall be PII-redacted and retained per regional policy. |
| NFR-COMP-4 | The audit trail shall be exportable in a form suitable as SOC2/ISO evidence. |

## 6. Observability

| ID | Requirement |
|---|---|
| NFR-OBS-1 | Every run shall be traceable end-to-end via a single `trace_id` spanning all services and external tool calls. |
| NFR-OBS-2 | Agent quality regressions shall be detectable via a rising gate-rejection-rate signal per agent version. |

## 7. Maintainability

| ID | Requirement |
|---|---|
| NFR-MAINT-1 | The entire stack shall use TypeScript with shared Zod schemas (`packages/contracts`) across web, API, and agent tools to prevent contract drift. |
| NFR-MAINT-2 | The Policy Engine shall be implemented as pure, unit-testable functions, independent of any specific HTTP framework. |
| NFR-MAINT-3 | Agent prompts and definitions shall be versioned independently of application code, enabling rollback without a redeploy. |

## Phase 1 implementation status (2026-09-17)

- NFR-SEC-1: the runtime still uses a long-lived Jira API token from `.env`; per-run scoped tokens are not yet implemented. The API verifies access tokens locally when `SUPABASE_JWT_SECRET` is set and never forwards them to the runtime.
- NFR-SEC-5: RLS is enabled on every table; governance tables have no client policies, so only the API's service role can read or write them.
- NFR-REL-1/3: no queue yet. A dropped API connection mid-turn is recorded as a failed run; a suspended run resumes across runtime restarts because Mastra persists the suspension and the draft store persists drafts.
- NFR-COST-1: per-agent budgets are not yet enforced; the API caps agent turns per user per minute and each turn's wall time.
- NFR-MAINT-1: `packages/contracts` is deferred; Zod schemas live next to their consumers in each app.
- NFR-MAINT-2: the policy module is pure data and functions with no framework dependency.

Ref: [../ARCHITECTURE.md §10](../ARCHITECTURE.md#10-reliability-safety-and-cost-controls), [§11](../ARCHITECTURE.md#11-observability), [§9.3](../ARCHITECTURE.md#93-multi-region)
