# SRS — 01. Overall Description

## 1. Product perspective

AURA is a new, multi-tenant, multi-region platform, not an extension of an existing system. It sits between the company's Jira instance (system of record for work) and its engineering toolchain (Git hosting, CI/CD, test frameworks, LLM providers), inserting a governed agent layer that drafts, proposes, and — only after human approval — executes changes to that toolchain.

It is composed of three deployable services (`apps/web`, `apps/api`, `apps/agent-runtime`), with a `sandbox-runner` for isolated code/test execution deferred to Phase 3, all built on a shared Supabase (Postgres + RLS + pgvector + object storage + auth) data plane per region. The browser talks only to `apps/api`; only `apps/api` talks to `apps/agent-runtime`. See [../ARCHITECTURE.md §3](../ARCHITECTURE.md#3-platform-architecture) for the full layered view.

## 2. Product functions (summary)

- Drive a Jira issue through Epic → Story → Architecture task → Dev PR → Test → Release using AI agents, with a durable human approval gate between every stage.
- Authorize every tool call an agent makes against a deterministic policy (user × project × agent version × tool × risk tier × environment).
- Record an immutable audit trail and provenance stamp for every artifact an agent creates.
- Generate and execute automated test suites (Playwright for UI, Robot Framework for API) from approved acceptance criteria, and let a Tester agent interpret — never fabricate — results.
- Enforce budgets, loop guards, and circuit breakers so agent misbehaviour degrades safely rather than cascading.

## 3. User classes and characteristics

| Role | Characteristics | Primary interaction |
|---|---|---|
| Project Owner | Owns business objectives; briefs the Orchestrator and approves Epics (Gate 1) | Web: Agent Workspace, Approval Inbox, Runs |
| Business Analyst | Translates Epics into Stories/AC/DoD; approves Stories (Gate 2); domain-fluent, not necessarily technical | Web: Agent Workspace, Approval Inbox, Runs |
| Architect | Technical decision-maker; approves ADRs and architecture tasks | Web: Run Console, diff viewer |
| Developer | Reviews and merges AI-generated PRs; scoped to a discipline (FE/BE/Data/AI/Integration) | Git host PR review + Web |
| QA Engineer | Approves test plans; verifies test results | Web: Approval Inbox |
| Tester | Executes/curates suites | Web + CI |
| Deployer | Approves releases; cannot approve their own high-risk deploy (four-eyes) | Web: Approval Inbox |
| Admin | Manages agent registry and policy; cannot bypass approval gates | Web: Registry Admin |

Full default role → agent grant matrix: [../ARCHITECTURE.md §4.2](../ARCHITECTURE.md#42-roles--agents-default-grants).

## 4. Operating environment

- Multi-tenant, multi-region from day one: organization → region → project.
- Regions (initial): EU, APAC, US. Project data, embeddings, artifacts, and LLM calls stay within the project's region.
- Deployed as containerised services (`web`, `api`, `agent-runtime`, `sandbox-runner`) behind CI/CD with blue/green or canary rollout.
- Identity via corporate SSO (SAML/OIDC) federated through Supabase Auth.

## 5. Design and implementation constraints

- TypeScript across the entire stack (React/Vite web, Express API, Mastra agent runtime). Go is not used in v1; it is reserved only for a possible future sandbox-runner rewrite.
- Jira remains the sole system of record for work; AURA must never become a second project-management system.
- All authorization, risk classification, and state transitions are deterministic code, never LLM output.
- All tool arguments are Zod-schema-validated before any policy check.
- Every Postgres table carries `org_id`, `region_id`, `project_id` and is protected by Row-Level Security; `audit_logs` is insert-only for every role, including the service role, in production.

## 6. Assumptions and dependencies

- The company already operates a Jira Cloud or Data Center instance that can be configured with a standard AURA workflow and can receive webhooks.
- Git hosting (GitHub or GitLab), CI/CD, and at least one LLM provider are available per region.
- Supabase (or an equivalent self-hosted Postgres + RLS + pgvector + auth stack) is approved for use as the data plane in every operating region.
- Open decisions in [../ARCHITECTURE.md §15](../ARCHITECTURE.md#15-open-decisions-to-be-captured-as-adrs) (queue technology, policy engine, Jira test management, sandbox isolation, eval tooling, vector store) are to be resolved as ADRs before or during Phase 0.
