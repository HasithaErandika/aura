# SRS — 02. Functional Requirements

Requirements are grouped by capability area and numbered `FR-<area>-<n>`. Each maps to the architecture section that specifies its design.

## FR-AUTH — Authentication & Authorization

| ID | Requirement |
|---|---|
| FR-AUTH-1 | The system shall authenticate all human users via corporate SSO (SAML/OIDC) federated through Supabase Auth. |
| FR-AUTH-2 | The system shall issue JWTs carrying `org_id`, `roles[]`, and `project_ids[]` as custom claims. |
| FR-AUTH-3 | The system shall evaluate every API request and every agent tool call through a deterministic Policy Engine: `can(user/run, project, agent@version, tool, action)`. |
| FR-AUTH-4 | The Policy Engine shall be data-driven (role → agent → tool grants stored in the Registry), editable per organization/project, and fully audited on change. |
| FR-AUTH-5 | The Agent Runtime shall never hold user credentials; it shall receive a signed, single-run grant bundle scoped to one run. |
| FR-AUTH-6 | Tool arguments shall be schema-validated (Zod) before the policy check on every call, rejecting unknown or extra fields. |

Ref: [../ARCHITECTURE.md §4](../ARCHITECTURE.md#4-authorization-model)

## FR-JIRA — Jira Integration

| ID | Requirement |
|---|---|
| FR-JIRA-1 | The system shall receive Jira webhooks on issue transitions and translate them into internal events on the event bus. |
| FR-JIRA-2 | Agents shall be triggered **only** by transitions into `Ready for *` Jira states. |
| FR-JIRA-3 | Agents shall be permitted to move a Jira issue **only** into `* Review` states; every `Approved` / `Ready for` transition shall require a human action. |
| FR-JIRA-4 | The system shall write agent outputs back to Jira (issues, comments, links) only after the relevant approval has been granted. |
| FR-JIRA-5 | Every Jira write shall carry an idempotency key to prevent duplicate issue creation on retry. |

Ref: [../ARCHITECTURE.md §5.2](../ARCHITECTURE.md#52-jira-status-machine-per-issue-type)

## FR-APPR — Human Approval Workflow

| ID | Requirement |
|---|---|
| FR-APPR-1 | Every agent run shall enter a durable `SUSPENDED_FOR_APPROVAL` state before any MEDIUM- or HIGH-risk tool call executes. |
| FR-APPR-2 | An approval request shall record a snapshot of the exact proposed payload, a diff, requester identity, and timestamp — independent of Jira. |
| FR-APPR-3 | Approval tokens shall be single-use and bound to a hash of the approved payload; if the payload changes after approval, execution shall fail closed. |
| FR-APPR-4 | HIGH-risk actions shall require four-eyes approval (approver ≠ requester). |
| FR-APPR-5 | Approval requests shall expire per a configurable SLA timer, transitioning the run to `EXPIRED` and escalating to a role backup; the system shall never auto-approve on timeout. |
| FR-APPR-6 | The Web UI shall provide an Approval Inbox showing pending approvals, diffs, and one-click approve/reject with mandatory reason on reject. |

Ref: [../ARCHITECTURE.md §5](../ARCHITECTURE.md#5-human-in-the-loop-workflow), §4.3

## FR-AGENT — Agent Lifecycle & Execution

| ID | Requirement |
|---|---|
| FR-AGENT-1 | Every agent shall be defined as versioned, declarative data (id, purpose, model, prompt ref, inputs, tool allow/deny list, outputs, approval role, budget, eval suite) — never a free-text prompt alone. |
| FR-AGENT-2 | Agents shall progress through lifecycle statuses `DRAFT → CANARY → ACTIVE → DEPRECATED`; promotion to `ACTIVE` requires an eval score above threshold **and** human sign-off. |
| FR-AGENT-3 | The Orchestrator shall be a deterministic Mastra workflow (a `jira_status → agent` lookup table), not an LLM decision. |
| FR-AGENT-4 | Large agents (BA, Architect) shall decompose into sub-steps within one workflow, each with its own tool grants and output schema. |
| FR-AGENT-5 | Every run shall persist: agent version, prompt version, model + version, tool versions, full input/output snapshots, token/cost, trace ID, approver identities, and touched Jira/Git artifacts. |
| FR-AGENT-6 | The system shall enforce a `max_iterations` cap per ticket (default 3); exceeding it shall transition the run to `HALTED_LOOP_GUARD` and escalate to a human. |

Ref: [../ARCHITECTURE.md §6](../ARCHITECTURE.md#6-agent-layer)

## FR-TOOL — Tool Gateway

| ID | Requirement |
|---|---|
| FR-TOOL-1 | All agent side effects (Jira, Git, CI, sandbox, docs) shall pass through a single Tool Gateway; no agent shall have raw SDK access to an external system. |
| FR-TOOL-2 | Each tool call shall pass, in order: schema validation, policy check, risk-tier evaluation, idempotency-key check, timeout/circuit-breaker, execution via a typed adapter, audit write, provenance stamp. |
| FR-TOOL-3 | Every artifact created by an agent (Jira issue, PR, document) shall carry a provenance stamp identifying agent, version, prompt version, model, run ID, trace ID, source issue, and approver. |
| FR-TOOL-4 | Untrusted content (Jira ticket text, PR descriptions, repository contents) shall be treated as data, never as instructions; tool calls shall be validated regardless of embedded instructions in that content. |

Ref: [../ARCHITECTURE.md §7](../ARCHITECTURE.md#7-tool-gateway)

## FR-TEST — Testing Architecture

| ID | Requirement |
|---|---|
| FR-TEST-1 | The QA Agent shall generate a test plan, coverage matrix, Playwright (UI/E2E) suites, and Robot Framework (API) suites from approved acceptance criteria. |
| FR-TEST-2 | Tests shall execute only in CI or an ephemeral sandbox, never inside the LLM's process. |
| FR-TEST-3 | The `test_results` record shall be written by the CI reporter, not by an agent; agents shall have read-only access to it. |
| FR-TEST-4 | The Tester Agent's output shall be labelled `AI interpretation` and stored separately from the machine-generated `test_results`. |
| FR-TEST-5 | Test evidence (traces, screenshots, logs) shall be retained per regional policy and linked from the originating Jira issue. |

Ref: [../ARCHITECTURE.md §8](../ARCHITECTURE.md#8-testing-architecture)

## FR-REG — Agent Registry & Admin

| ID | Requirement |
|---|---|
| FR-REG-1 | The Registry UI shall allow Admins to view, create, and modify role → agent → tool grants, with full audit of every change. |
| FR-REG-2 | The Registry shall support per-organization and per-project grant overrides. |
| FR-REG-3 | Admins shall not be able to approve gated actions on behalf of another role or bypass an approval gate. |

Ref: [../ARCHITECTURE.md §4.2](../ARCHITECTURE.md#42-roles--agents-default-grants)

## FR-OBS — Observability & Audit

| ID | Requirement |
|---|---|
| FR-OBS-1 | The system shall emit OpenTelemetry traces spanning web → API → queue → runtime → tool → external system, with one `trace_id` per run surfaced in the corresponding Jira comment. |
| FR-OBS-2 | The system shall track metrics: runs by state, approval latency, gate rejection rate per agent, cost per run/project/region, tool error rate, eval scores per agent version. |
| FR-OBS-3 | `audit_logs` shall be append-only; no role, including the service role in production, shall have `UPDATE`/`DELETE` privileges on it. |
| FR-OBS-4 | The system shall alert on: budget breach, loop-guard trips, approval SLA breaches, open circuit breakers, and RLS policy violations. |

Ref: [../ARCHITECTURE.md §11](../ARCHITECTURE.md#11-observability)
