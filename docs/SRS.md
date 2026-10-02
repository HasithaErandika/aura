# AURA Software Requirements Specification

| | |
|---|---|
| **Version** | 0.4 |
| **Updated** | 2026-10-02 |
| **Companion** | [ARCHITECTURE.md](ARCHITECTURE.md) describes *how*; this document describes *what* |

**Status key:** 🟢 Built · 🟡 Partial · 🔴 Not built

---

## 1. Overview

### 1.1 Purpose

AURA coordinates AI agents across the software delivery lifecycle. It must:

- use **Jira** as the system of record for work,
- enforce **role-based access** outside the model,
- put **human approval** in front of every change,
- keep **full provenance** from requirement to release.

### 1.2 Out of scope

Replacing Jira · autonomous production changes · non-TypeScript services.

### 1.3 Users

| Role | Main activity | Gates |
|---|---|---|
| Project Owner | Briefs the Orchestrator, approves Epics | 1 |
| Business Analyst | Approves Stories, acceptance criteria, DoD | 2 |
| Architect | Approves design, ADRs, Tasks; edits design docs | 3 |
| Developer | Works on Tasks in VS Code; approves the plan, the code and the pull request | 4, 5, 6 |
| QA Engineer | Approves test plans and scenarios; follows each Task's PR and CI | QA plan |
| Deployer | Approves release plans | 8 |
| Admin | Users, projects, audit export; cannot approve gates | — |

### 1.4 Constraints

- TypeScript across the stack.
- Authorization, risk and state transitions are code, never model output.
- Tool arguments are schema-validated (Zod).
- `audit_logs` is append-only for every role.

---

## 2. Functional requirements

### FR-AUTH · Authentication and authorization

| ID | Requirement | Status |
|---|---|---|
| FR-AUTH-1 | Users sign in through corporate SSO (SAML/OIDC) | 🔴 Email/password, admin-provisioned |
| FR-AUTH-2 | Tool clients sign in with revocable, expiring personal access tokens | 🟢 |
| FR-AUTH-3 | Every request and tool call is checked against role → agent → tool grants | 🟢 |
| FR-AUTH-4 | Grants are data, editable per project, with audit | 🟡 Data in code; not editable in the UI |
| FR-AUTH-5 | The runtime never holds user credentials | 🟢 |
| FR-AUTH-6 | Only the API can call the runtime | 🟢 |
| FR-AUTH-7 | Admins change agent limits and governance values in the dashboard, globally or per project, with audit | 🟢 |

### FR-JIRA · Jira integration

| ID | Requirement | Status |
|---|---|---|
| FR-JIRA-1 | Approved output is written to Jira (Epics, Stories, Tasks, Bugs, comments) | 🟢 |
| FR-JIRA-2 | Jira writes are idempotent on retry | 🟢 |
| FR-JIRA-3 | Jira webhooks start agent runs | 🔴 Runs start from a person |
| FR-JIRA-4 | Task status follows Git events (In Progress → In Review → Ready for Release → Done) | 🔴 |

### FR-APPR · Human approval

| ID | Requirement | Status |
|---|---|---|
| FR-APPR-1 | Every medium-risk action waits for a durable human decision | 🟢 |
| FR-APPR-2 | The decision is bound to a hash of the exact payload | 🟢 |
| FR-APPR-3 | One approval authorizes one step only | 🟢 |
| FR-APPR-4 | Approvals expire on an SLA timer; never auto-approve on timeout | 🟢 |
| FR-APPR-5 | High-risk actions need two approvers (four-eyes) | 🔴 No high-risk actions exist |
| FR-APPR-6 | Approval inbox with approve, revise and reject (reason required) | 🟢 |

### FR-AGENT · Agents

| ID | Requirement | Status |
|---|---|---|
| FR-AGENT-1 | The Orchestrator and the vscode-agent reach other agents only through gated delegate tools | 🟢 |
| FR-AGENT-2 | Drafting agents return structured output and hold no tools | 🟢 |
| FR-AGENT-3 | Large agents run as multi-step workflows or code-driven loops | 🟢 Architect, QA, coder ↔ Evaluator loop |
| FR-AGENT-4 | Agents have versions, prompt versions and models in a registry | 🟢 Static file |
| FR-AGENT-5 | A new agent version must pass evals before use | 🟡 PO, BA, Deployer suites |
| FR-AGENT-6 | Loops stop at a limit and hand over to a person (`HALTED_LOOP_GUARD`) | 🟢 |
| FR-AGENT-7 | Every artifact carries a provenance stamp | 🟢 |

### FR-TOOL · Tool gateway

| ID | Requirement | Status |
|---|---|---|
| FR-TOOL-1 | Every tool call passes one gateway: risk tier, approval check, loop guard, record | 🟢 |
| FR-TOOL-2 | Untrusted text is treated as data and scanned for injection | 🟢 |
| FR-TOOL-3 | Timeouts and circuit breakers on external calls | 🔴 |

### FR-CODE · Code and Git

| ID | Requirement | Status |
|---|---|---|
| FR-CODE-1 | Each Task works on its own branch `feat/<EPIC>/<TASK>` from `development` | 🟢 |
| FR-CODE-2 | Coding output is reviewed by a second agent and verified by real checks | 🟢 Evaluator; code decides pass |
| FR-CODE-3 | Developers commit and push with their own identity | 🟢 Developer's git and `gh` |
| FR-CODE-4 | Code lives in a registered project repository | 🟢 Connect Repository / Initialize Project |
| FR-CODE-5 | Gate 6 opens one pull request per Task to `development`, with provenance and reviewers | 🟢 |
| FR-CODE-6 | Coding and QA share one OpenAPI contract | 🔴 |
| FR-CODE-7 | A plan may split into 2–4 parts with disjoint file scopes, run in parallel and merged by code | 🟢 |
| FR-CODE-8 | The cloud stores no source code | 🟡 Legacy server worktrees until V7 |

### FR-TEST · Testing

| ID | Requirement | Status |
|---|---|---|
| FR-TEST-1 | QA generates a test plan and scenarios from approved Stories | 🟢 Postgres |
| FR-TEST-2 | Tests run outside the model process | 🟢 Developer's machine and GitHub Actions |
| FR-TEST-3 | Results come from the test runner's output, not a model | 🟢 |
| FR-TEST-4 | CI on the PR is the authoritative result, reported to AURA and shown to QA | 🟢 `aura-ci.yml` → `/ci/report` |
| FR-TEST-6 | CI failures go back to the coder, then Gates 5 and 6 again | 🟢 |
| FR-TEST-5 | API test suites | 🔴 |

### FR-VSC · Developer workspace (VS Code)

| ID | Requirement | Status |
|---|---|---|
| FR-VSC-1 | Developers sign in from VS Code through the browser | 🟢 |
| FR-VSC-2 | Agent file and command calls run on the developer's machine through the extension, audited | 🟢 |
| FR-VSC-3 | Permission modes, project rules, built-in denies and hooks apply before any call runs | 🟢 |
| FR-VSC-4 | The workspace is read-only until the Task's plan is approved | 🟢 |
| FR-VSC-5 | The developer can stop, resume and add notes to a running Task | 🟢 |
| FR-VSC-6 | QA and the developer are notified when a PR opens and when CI finishes | 🟢 In-app; email and Slack not built |

### FR-OBS · Observability and audit

| ID | Requirement | Status |
|---|---|---|
| FR-OBS-1 | Append-only audit log with explorer and export | 🟢 |
| FR-OBS-2 | Metrics: tool calls, blocks, injection findings, tokens | 🟢 `/metrics` |
| FR-OBS-3 | Approval and first-pass rates per agent | 🟢 |
| FR-OBS-4 | One trace id per run across services | 🟡 Runtime spans only |
| FR-OBS-5 | Alerts on budget, loop guard and SLA breaches | 🔴 |

---

## 3. Non-functional requirements

| ID | Area | Requirement | Status |
|---|---|---|---|
| NFR-SEC-1 | Security | No secrets in prompts, logs or agent memory | 🟢 |
| NFR-SEC-2 | Security | Forbidden tools (policy edits, audit changes) are never callable | 🟢 |
| NFR-SEC-3 | Security | Agent commands run only under the developer's permission rules | 🟢 |
| NFR-SEC-4 | Security | Database enforces project scope (RLS) | 🔴 |
| NFR-REL-1 | Reliability | Runs survive a runtime restart | 🟡 Gates, drafts, memory and client streams survive; a running turn is marked INTERRUPTED, not resumed |
| NFR-REL-2 | Reliability | Durable queue between API and runtime | 🟢 pg-boss |
| NFR-REL-3 | Reliability | Model fallback on provider failure | 🟢 Groq → Gemini chains |
| NFR-COST-1 | Cost | Token budget per run | 🟡 Legacy Coding Council only |
| NFR-COST-2 | Cost | Budgets per developer and team | 🔴 |
| NFR-COST-3 | Cost | Token usage visible per agent and model | 🟢 |
| NFR-SCALE-1 | Scale | API and runtime scale independently | 🔴 Local state |
| NFR-COMP-1 | Compliance | Audit export usable as SOC2/ISO evidence | 🟢 |
| NFR-COMP-2 | Compliance | Data stays in the project's region | 🔴 |
| NFR-MAINT-1 | Maintainability | Policy is pure, unit-tested functions | 🟢 |
| NFR-MAINT-2 | Maintainability | Deterministic code has unit tests in CI | 🟢 |

---

## 4. External interfaces

```mermaid
flowchart LR
    AURA["AURA"] -->|"MCP · REST"| JIRA["Jira Cloud"]
    AURA -->|"Auth · Postgres"| SUPA["Supabase"]
    AURA -->|"API"| LLM["Groq · Gemini · Claude"]
    EXT["VS Code extension"] -->|"developer's git + gh"| GH["GitHub"]
    GH -->|"OIDC CI report"| AURA
    AURA -.->|"planned"| IDP["SSO provider"]
```

| System | Use | Status |
|---|---|---|
| Jira | Read issues; write approved Epics, Stories, Tasks, Bugs, comments | 🟢 |
| Supabase | Auth, users, runs, approvals, audit, projects | 🟢 |
| LLM providers | Groq and Gemini; Claude ready via registry | 🟢 |
| VS Code | The developer's client; runs the agents' tool calls | 🟢 |
| GitHub | Branches and PRs through the developer's `gh`; CI reports through Actions OIDC | 🟢 Webhooks and check runs not built |
| Docker | Legacy scaffolds and test runs | 🟡 Removed in V7 |
| SSO provider | SAML / OIDC | 🔴 |

---

## 5. Use cases

```mermaid
flowchart LR
    UC1["UC-1 Epic"] --> UC2["UC-2 Stories"] --> UC3["UC-3 Design"] --> UC4["UC-4 Plan"] --> UC5["UC-5 Code"] --> UC6["UC-6 Pull request"] --> UC8["UC-8 Release plan"]
    UC3 --> UC7["UC-7 Test plan"]
```

| UC | Actor | Trigger | On approve |
|---|---|---|---|
| UC-1 | Project Owner | Briefs the Orchestrator | Epic filed in Jira |
| UC-2 | Business Analyst | Epic approved | Stories filed under the Epic |
| UC-3 | Architect | Stories approved; picks backend | Tasks filed; design docs and ADRs written |
| UC-4 | Developer | Starts a Task in VS Code | Plan stored; Task branch checked out |
| UC-5 | Developer | Plan approved | Coders and the Evaluator change the code; change accepted |
| UC-6 | Developer | Change accepted | PR to `development` opened and recorded; QA notified |
| UC-7 | QA Engineer | Stories approved | Test plan and scenarios saved |
| UC-8 | Deployer | CI and review pass | Release, change and rollback plan filed |
| UC-9 | Admin | Any time | Manage users and projects; export audit |

**Revise** produces a new draft version for the same approver. **Reject** ends the run with nothing
written.

---

## 6. Data

| Store | Contents |
|---|---|
| Supabase | `profiles`, `access_tokens`, `workflow_runs`, `run_steps`, `run_events`, `run_notes`, `approval_requests`, `approval_decisions`, `audit_logs`, `projects`, `repositories`, `task_branches`, `task_dependencies`, `settings`, `design_documents`, `notifications` |
| Runtime Postgres (or local libSQL) | Agent memory, drafts, token usage, model usage, approval use |
| Developer's machine and GitHub | Source code, branches, PRs |

Supabase stores runtime data by reference (`thread_id`, draft ids), never as a copy.
