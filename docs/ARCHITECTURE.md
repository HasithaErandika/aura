# AURA — Enterprise AI Agent Orchestration Platform

> **Status:** v0.4 — adds the tool gateway, projects/repositories, the Git provider, and evaluation + token usage
> **Owner:** Platform Architecture
> **Last updated:** 2026-09-29

This document describes the **built system** first, then lists everything
planned but not implemented in one place: [Section 5 — Pending (Future)](#5-pending-future).
How agent quality and token usage are measured, with the current numbers:
[Section 6 — Evaluation and token usage](#6-evaluation-and-token-usage).
If a capability isn't mentioned in Sections 1–4, assume it doesn't exist yet.

---

## 1. What AURA is

AURA is an AI agent orchestration platform for the software delivery
lifecycle. It coordinates specialised agents (PO, BA, Architect, Developer,
QA, Tester, Deployer), uses **Jira as the single system of record**, and
gates every consequential action behind human approval. There is no human
"Tester" role — Tester is an agent capability QA Engineer starts and
oversees (a bounded test/diagnose/route/retest loop, section 2.4), not a
person a project assigns.

### Six principles

1. **Agents propose; deterministic code decides.** Authorization, risk
   classification, and audit are never delegated to a prompt.
2. **Jira is the work state machine.** Agents react to Jira transitions and
   write back to Jira; AURA is not a second project-management system.
3. **Human-in-the-loop is a workflow primitive.** Every stage ends in a
   durable "waiting for approval" state; nothing continues without a
   recorded human decision. One deliberate, narrow exception: once a human
   approves *starting* the Tester Agent loop (Gate 7), its own bounded
   internal retries (up to 3 attempts) do not each ask for approval again —
   the same trust boundary the Architect workflow's many internal model
   calls already rely on for Gate 3. The loop still never guesses on an
   unsure diagnosis (principle 5) and always halts to a human at the cap.
4. **Every tool call is authorized, validated, and logged.** An agent can
   only call what the policy engine grants for *this user, project, and
   agent* — never what the model decides to try.
5. **Evidence over assertion.** An agent may never claim a test passed or a
   requirement is met without a machine-generated artifact behind it.
6. **Every Task gets an isolated workspace; agents never share a mutable
   one.** Two Tasks of the same Epic and discipline never touch the same
   working directory at the same time — each gets its own git worktree and
   branch (section 2.4, "Concurrent Task Execution"). This is about
   concurrent *developers/Tasks* within one project, a different problem
   from multi-*tenant* isolation between organizations (not built — see
   section 5.3): worktrees solve the first, not the second.

---

## 2. Built: system overview

### 2.1 Services

| Service | Stack | Owns |
|---|---|---|
| `apps/web` | React + Vite + TS | UI: approval inbox, run console, Jira browser, **Project Files** - one VS Code-style workspace per Epic (Explorer sections Architecture · QA · Code, CodeMirror editor, Terminal · Test runs · Runners panel, status bar; who sees/edits what follows the policy grants - `features/project-files/access.ts`), access tokens |
| `apps/api` | Node + Express + TS | Auth (Supabase sessions and personal access tokens), policy engine, approvals, Jira read/write, audit log, terminal tickets |
| `apps/agent-runtime` | Mastra (TS) | Agents, workflows (incl. the Coding Council), delegate tools, draft store, workspace files, the web terminal's WebSocket server |
| `apps/cli` | Node + TS (`aura`) | The developer's terminal client: Tasks, worktrees, coding runs, gate decisions, commits/pushes as the developer |
| `packages/aura-client` | TS library | Typed REST + SSE client for `apps/api`, shared by the CLI (and later the web app / VS Code extension) |

Flow: browser or `aura` CLI → `apps/api` (authorizes) → `apps/agent-runtime`
(runs the agent) → external systems (Jira, Docker, filesystem), all behind
the same approval gate. The CLI gets no privilege the web app doesn't have:
starting a coding run is a chat turn, deciding a gate is the same
`POST /approvals/:id/decide`.

There is **no event bus / queue yet** — API and runtime talk directly.

### Full system diagram (as built)

```mermaid
flowchart TD
    ROLES(["PO · BA · Architect · Developer<br/>QA Engineer · Deployer"]) --> WEB
    DEVS(["Developer"]) --> CLI

    subgraph WEB["apps/web — React"]
        UI["Approval Inbox · Run Console · Jira Browser<br/>Project Files: design · QA · code · terminal · test runs · runners"]
    end

    CLI["apps/cli — aura<br/>(packages/aura-client)"]

    WEB <-->|"JWT / REST + SSE"| API
    CLI <-->|"access token / REST + SSE"| API
    WEB <-->|"WebSocket + API-signed ticket"| TERM

    subgraph API["apps/api — Express"]
        AUTH[Auth]
        POL["Policy Engine<br/>role x project x agent x tool"]
        APR["Approval Service<br/>approval_requests"]
        AUD[Audit Writer]
    end

    API <-->|"direct call, no queue"| RT

    subgraph RT["apps/agent-runtime — Mastra"]
        ORCH{{"Orchestrator<br/>10 tools: ask_user + 8 delegate_to_* + git"}}

        subgraph AGENTS["Sub-agents — propose only, hold no tools"]
            PO_A[PO]
            BA_A[BA]
            AR_A["Architect Workflow"]
            DEV_A[Dev]
            QA_A[QA]
            TS_A[Tester]
            DP_A[Deployer]
        end

        CODE["Coding Agent<br/>Coding Council / single built-in agent"]
        TERM["Terminal server<br/>PTY in a Task worktree"]
        GITT["Git tool"]
        CI["CI tool"]
        MEM[("Agent memory<br/>libSQL threads")]

        ORCH --> AGENTS
        ORCH --> CODE
        ORCH --> GITT
        ORCH --> CI
        ORCH --> MEM

        AGENTS -->|"structured JSON draft"| DRAFT[("Draft store<br/>libSQL")]
        CODE --> DRAFT

        EXEC{{"Execute (deterministic)<br/>delegate-tools.ts"}}
        DRAFT -->|"human approves, payload-hash checked"| EXEC
        GITT --> EXEC
        CI --> EXEC
    end

    EXEC --> JIRA[("Jira<br/>Epics · Stories · Tasks · Bugs")]
    EXEC --> DOCKER[("Docker sandbox<br/>scaffold · coding CLI · Playwright")]
    EXEC --> CHECKS[("Host checks, allowlisted<br/>typecheck · build · test · lint")]
    EXEC --> FILES[("Workspace files<br/>architecture.md · ADRs · SRS · QA specs")]

    API --> SUPA[("Supabase<br/>profiles · access_tokens · workflow_runs · run_steps<br/>approval_requests/decisions · audit_logs")]
    AUD --> SUPA
```

### 2.2 Authorization

Every role → agent grant is data in `apps/api/src/modules/policy/policy.ts`,
not a prompt:

| Role | Can run | Approves |
|---|---|---|
| Project Owner | PO | Gate 1 (Epic) |
| Business Analyst | BA | Gate 2 (Stories) |
| Architect | Architect | Gate 3 (design) |
| Developer | Dev, Coding Agent (incl. Coding Council), Git | Gates 4–5 |
| QA Engineer | QA, Tester | Gates 6–7 (sole approver of both; starts and oversees the Tester Agent loop) |
| Deployer | Deployer | Gate 8 |

Risk tiers, attached to tools:

| Tier | Behaviour |
|---|---|
| 🟢 LOW | Auto-execute, logged (reads, drafts) |
| 🟡 MEDIUM | Draft → human approval → execute (Jira writes, scaffolds, code, tests) |
| 🔴 HIGH | Not used yet — reserved for production actions |
| ⛔ FORBIDDEN | Not callable by any agent |

Every gated tool call: schema-validate args (Zod) → policy check (`can(user,
project, agent, tool)`) → if MEDIUM+, create an `approval_requests` row with
a hash of the exact payload → suspend → human decides → resume with a
single-use, payload-bound approval token → execute → audit record.

The runtime never holds user credentials or raw Jira/DB access; it only
calls its own gated tools.

**Only the API may call the runtime.** With `MASTRA_RUNTIME_TOKEN` set (the
same value in both apps), the runtime rejects every request that doesn't
carry it as a bearer token (`server/runtime-auth.ts`, a server-wide Mastra
middleware covering Mastra's own `/api/*` routes and AURA's custom routes).
Without it, anyone who could reach port 4111 could run an agent, resume a
suspended gate or write workspace files and skip the policy engine, the
approval gates and the audit log. `AURA_MODE=server` makes the token
mandatory in both apps; `AURA_MODE=local` (the default) allows leaving it
unset on loopback so Mastra Studio keeps working.

**Personal access tokens** (`access_tokens`, migration 0006) let the `aura`
CLI authenticate without a browser: `aura_pat_…`, stored only as a SHA-256
hash, expiring (default 90 days), revocable from the Profile page, audited
on create/revoke. `middleware/auth.ts` resolves a token to its owner and then
applies exactly the same profile/role checks as a Supabase session — a token
never grants more than its owner's role. A token cannot mint another token
(creation is browser-session-only). Opening the web terminal mints a
short-lived (8h) token of kind `terminal`, hidden from the Profile list, so
`aura` inside it works without `aura login`; it reaches the shell encrypted
inside the terminal ticket (AES-256-GCM), never in plain text in the browser.

**Web terminal tickets**: `POST /terminal/tickets` (Developer role only,
audited as `terminal.session.start`) signs a 60-second, single-use ticket
(HMAC-SHA256, `TERMINAL_TICKET_SECRET` shared with the runtime). The
runtime's terminal server only verifies tickets; it never decides who may
connect.

### 2.3 Human approval gates

One Mastra agent, **the Orchestrator**, decides which agent to delegate to
next and asks the human when it needs input (`ask_user`). It has exactly
ten tools — `ask_user` and one `delegate_to_*` per gate below, plus `git` —
and cannot reach Jira, memory, or anything else directly. A wrong decision
by the Orchestrator produces a delegation a human can reject, never a
direct write.

| Gate | Agent | Produces | Approver |
|---|---|---|---|
| 1 | PO | Epic draft | PO |
| 2 | BA | Stories, AC, DoD, risks | BA |
| 3 | Architect | Design, ADRs, architecture Tasks | Architect |
| 4 | Dev | Project init: git + scaffold (Frontend and/or Backend, per Task) + CI workflow file | Developer |
| 5 | Coding Agent | Real code in the scaffold | Developer |
| 6 | QA | Test plan + real Playwright specs, informed by the real code | QA Engineer |
| 7 | Tester | Bounded test/diagnose/route/retest loop (up to 3 attempts) | QA Engineer starts it; the loop's own retries need no further approval |
| 8 | Deployer | Release / change / rollback plan (plan only) | Deployer |

### Delivery pipeline (as built)

```mermaid
flowchart TD
    PO["PO — Gate 1<br/>Epic draft"] --> BA["BA — Gate 2<br/>Stories, AC, DoD"]
    BA --> ARCH["Architect — Gate 3<br/>Design, ADRs, architecture Tasks"]
    ARCH --> DEV["Dev — Gate 4 (Project Init)<br/>first Task of a discipline: scaffold + git init + chore commit + CI workflow file<br/>every Task: its own isolated git worktree + branch off that base"]
    DEV --> CODE["Coding Agent — Gate 5<br/>Production code · unit/integration tests"]
    CODE --> QA["QA Agent — Gate 6<br/>inspects implementation/API/UI · writes test scenarios · Playwright/API tests"]
    QA --> QAOK{"Human (QA Engineer)<br/>approves and starts Gate 7"}
    QAOK --> RUN

    subgraph TESTER["Tester Agent — Gate 7 (bounded loop, max 3 attempts)"]
        direction TB
        RUN["Run suite"] --> PASSCHK{"Passed?"}
        PASSCHK -->|"yes"| DONE["Ready for Release"]
        PASSCHK -->|"no"| DIAG["Diagnose from evidence<br/>(error, test source, commit, app output)"]
        DIAG -->|"code defect"| TOCODE["Coding Agent<br/>scoped fix -> commit"]
        DIAG -->|"test defect"| TOQA["QA Agent<br/>revise only that scenario"]
        DIAG -->|"unknown / low confidence"| ESCALATE["Human — escalated immediately"]
        TOCODE --> RETEST["Retest"]
        TOQA --> RETEST
        RETEST --> CAP{"attempt <= 3?"}
        CAP -->|"yes"| RUN
        CAP -->|"no"| HALT["HALTED_LOOP_GUARD"]
    end

    ESCALATE --> HUMAN["Human investigation<br/>(full attempt history attached)"]
    HALT --> HUMAN
    DONE --> DEPLOY["Deployer — Gate 8<br/>release / change / rollback plan (plan only)"]
```

Two things this diagram makes explicit that the table doesn't. First, Gate 4 fires **once per Task**, not once per discipline: the scaffold command itself (git init, `npm create vite@latest`/`nest new`, CI workflow file) only runs for the *first* Task of a discipline in an Epic — every Task after that, including that first one, gets its own isolated git worktree checked out on its own branch (`feature/<taskKey>`) off the shared base repo (`workspace/dev-workspace.ts`'s `ensureTaskWorktree`). This is the actual fix for two Tasks of the same discipline racing or overwriting each other in one shared directory — every agent from here on (Coding Agent, Git tool, Tester Agent) operates on that Task's own worktree, never the base. Dependency installs aren't repeated per Task either: a fresh worktree's `node_modules` is symlinked from the base repo's already-installed one rather than reinstalled.

Second, "test infrastructure" (a dedicated Playwright config/directory, as opposed to the scenario files themselves) is still not a distinct Dev deliverable — the test directory is created lazily, by QA's own file step (Gate 6) and by Tester's run step (Gate 7), not provisioned upfront at Gate 4.

This is the "Concurrent Task Execution" milestone, not full "enterprise readiness": it solves multiple Tasks/developers safely sharing one project (git isolation), which is a different, narrower problem than multi-*tenant* isolation between organizations (`org_id`/RLS — still not built, section 5.3). Deliberately deferred alongside it: an Integration Agent to detect (not auto-resolve) merge conflicts between Tasks' branches, real remote Git (a GitHub App, push, PR, required checks), and multi-repository support — worktrees only solve isolation *within* one repository.

Rules:
- A gate only fires when a human asks for that stage; nothing auto-advances
  to the next gate after an approval.
- Only content approved at a gate is ever written to Jira, Docker, or disk.
- PO and BA hold no tools at all — they return structured JSON (Zod
  schemas); rendering and filing is code, not the model.

### 2.4 Agents

- **PO / BA** — draft Epics and Stories as structured JSON only; no tools.
- **Architect** — a multi-step Mastra **Workflow**, not one model call:
  requirements → decomposition → parallel API/data/security/AI design →
  deployment notes → ADRs + architecture Tasks + workspace docs. Frontend
  is fixed to React 19 + Vite; database fixed to PostgreSQL; the human
  picks the backend (NestJS or Spring Boot) before drafting starts. Design
  docs (`architecture.md`, `plan.md`, ADRs, SRS) are written to
  `<AURA_WORKSPACE_ROOT>/<epicKey>/architecture/` only after Gate 3 approval,
  and are editable by an Architect in the web app's Project Files page, where
  every pipeline role reads them next to the code (no version history on
  manual edits).
- **Dev (Gate 4)** — project init, per Task: explains, but does not choose,
  a fixed scaffold command read from the Task's own discipline field. On
  approval: if this is the *first* Task of that discipline in the Epic, it
  runs the scaffold in an ephemeral, non-root Docker container against a
  shared **base repo**, then finishes it (CI workflow file, `.gitignore` if
  missing, `git init` + `chore: initial scaffold` commit). Either way — first
  Task or not — it then creates that Task's own isolated **git worktree**,
  checked out on its own branch (`feature/<taskKey>`) off the base
  (`workspace/dev-workspace.ts`'s `ensureTaskWorktree`), and every downstream
  tool for that Task (Coding Agent, Git tool, Tester Agent) operates on the
  worktree, never the base or another Task's worktree. A worktree's
  `node_modules` is symlinked from the base's, not reinstalled. **Frontend
  and Backend/NestJS are implemented and verified** (real Docker run,
  correct file ownership). Backend/Spring Boot, Data, AI, Integration, and
  Deployment are **not implemented** — the tool fails clearly rather than
  doing nothing.
- **Coding Agent (Gate 5)** — implements the Task, in that Task's own
  worktree (never the shared base, never another Task's worktree), and is
  now also asked to write/update unit and integration tests alongside it,
  using whatever test runner the scaffold already includes — end-to-end/UI
  testing stays QA's job (Gate 6), not this agent's. Three interchangeable
  providers behind the same draft/approve/execute flow:
  - **AURA Coding Council** (`provider: "council"`,
    `workflows/coding-council.ts`, the default for the `aura` CLI) — three
    agents discuss the work inside one approved Gate 5 execute: a **Planner**
    (read-only file tools) writes a file-by-file plan, a **Reviewer** (no
    tools; structured JSON verdict) critiques it, an **Implementer** (the
    only role with write/edit tools and allowlisted checks) implements it,
    the project's own typecheck/build/test/lint run on the host
    (`lib/sandbox.ts`, fixed check ids, no shell, no Docker needed), and the
    Reviewer reviews the real diff + real check output → APPROVE or
    CHANGES → the Implementer fixes only the listed issues, for a bounded
    number of rounds. A failing check forces CHANGES regardless of the
    Reviewer. Each round ends in a checkpoint commit (`council: round N`,
    AURA identity) on the Task branch; every turn streams live as SSE event
    `council` and is persisted in `run_steps`; the transcript is written to
    `<worktree>/.aura/council/<draftId>.md` (git-excluded). If the Reviewer
    never approves, the Task is **not** moved to In Review. Runs on
    free-tier models: an ordered Groq/Gemini fallback chain per role, set in
    `agents/registry.ts` (`COUNCIL_*_MODEL_IDS`) like every other agent's
    model; moving to Claude means putting `anthropic/claude-sonnet-5` first
    in each list.
    It has its own Agent Registry entry and policy row (`coding-council`:
    Developer runs it and approves Gate 5; Architect and admin read), reported
    live by the runtime (`GET /council/registry`: real tools per role and the
    registry's model chains), and council runs carry their own provenance
    stamp (`coding-council`).
    **Partially verified:** plan → plan review → build → checks → checkpoint
    ran end-to-end with real models; the code-review step then failed on an
    expired Groq key, and the retry behavior added in response has not been
    re-run yet.
  - **AURA's own built-in agent** (single agent, no external account) — three
    file tools only (`list_files`/`read_file`/`write_file`), no shell
    access, every path checked to stay inside the Task's own worktree.
    Verified end-to-end with a real model and file.
  - The former **Claude Code / Codex** providers (external CLIs on the
    developer's personal login, run in Docker) were **removed** (ADR-3 D6):
    all coding runs on AURA's own agents and AURA-governed models.
  - No server-side git push/PR at any provider. Pushing is done by the
    developer from their own machine with `aura push [--pr]`, using their
    own git credentials and `gh`; AURA never holds a GitHub credential.
- **QA (Gate 6)** — drafts a test plan and real Playwright spec files from
  the Epic's approved Stories **and, if Frontend/Backend is already
  scaffolded or implemented, the real code** (`workspace/read-scaffold-
  context.ts`) — so scenarios prefer real routes/`data-testid`s over
  guessing when the app exists yet. Only Frontend and Backend/NestJS are
  supported (the disciplines Gate 4 can scaffold). Can also revise a single
  failing scenario in isolation (`revise-scenario`) instead of regenerating
  the whole plan — every scenario carries its own revision counter.
- **Tester (Gate 7)** — a bounded loop (`workflows/tester-workflow.ts`), not
  a single pass: starts the Task's own worktree for real and runs the suite
  in Docker (never a shared directory another Task could also be changing);
  the pass/failed/skipped counts always come from Playwright's own
  JSON output, read by code, never a model's claim. On failure it collects
  evidence (the real error, the failing test's own source, the current git
  commit, the app's own output) and diagnoses each failure through an
  explicit hierarchy — infra failure? app startup failure? test/env
  problem? test implementation problem? application defect? requirements
  ambiguity? — before acting. Only two outcomes route automatically: a test
  implementation problem back to QA (revising only that one scenario) or an
  application defect to the Coding Agent (a scoped fix against that same
  Task's own worktree, filing/updating one linked Jira Bug rather than a
  new one per attempt). Everything else — including any diagnosis
  the model isn't confident about — routes straight to a human; the loop
  never guesses. Retries up to 3 attempts, then sets the run to
  `HALTED_LOOP_GUARD` with the full attempt history attached.
- **Deployer (Gate 8)** — produces a release note, change plan, and
  rollback plan only. There is no execute mode and no deployment pipeline.
- **Git tool** — local `init`/`branch`/`commit` (gated) and `status`/`diff`
  (ungated, read-only), always against the Task's own worktree — `status`/
  `diff` show exactly this Task's changes, never another Task's sharing the
  same discipline. The Git tool itself never pushes; the only push path is
  the developer's own `aura push` (section 2.9). `init` is close
  to a no-op now (a worktree is already a real git checkout from creation).
  Gate 4's scaffold step also makes its own first commit automatically
  (`chore: initial <discipline> scaffold`) in the **base repo** right after
  scaffolding, before any worktree branches off it, under a fixed
  `AURA <aura@localhost>` identity (not the host's git config) — so `git
  diff` after Gate 5 shows exactly what the Coding Agent changed versus the
  raw scaffold, not every file as untracked.
- **CI tool** (`delegate_to_ci`) — re-runs a project's own checked-in local
  checks inside the same Docker sandbox, and can file a Jira Bug on failure.
  Takes an optional `taskKey`: given one, it runs against that Task's own
  worktree (recommended, tests real code); omitted, it runs against the
  shared base scaffold, which reflects no Task's changes once worktrees are
  in use. "CI" here means this local run; there is no external CI system
  involved.

### 2.5 Testing

Tests run for real, in AURA's own Docker sandbox — there is no CI pipeline
and no Robot Framework.

- Real Playwright specs are filed under `.workspaces/<epicKey>/qa/` and,
  best-effort, also copied into the shared **base** scaffold's own test
  directory (a convenience so a plain local `npm test` sees them too) — not
  into every Task's individual worktree, since that copy isn't what any
  gate actually reads from anyway (see below).
- Tester's `execute` starts the app and runs the suite in the same sandbox
  Gates 4–5 use; the JSON result is stored on the draft record, not
  invented by the model. On `failed > 0`, it no longer just reports and
  stops — it diagnoses and retests automatically (up to 3 attempts) before
  ever asking a human, and only files/updates one Jira Bug per genuine
  application defect it finds (not one per attempt).
- A developer or QA Engineer can hand-edit scaffolded or QA files directly
  through the web UI (audited as `workspace.file.edit`, no version history).

### 2.6 Data

Built, in Supabase Postgres:
`profiles` (incl. `git_name`/`git_email`), `access_tokens`, `workflow_runs`,
`run_steps`, `approval_requests`, `approval_decisions`, `audit_logs`
(append-only — a DB trigger blocks `UPDATE`/`DELETE`, including for the
service role), and since migration 0007 `projects`, `repositories` (one per
project), `task_branches` and `task_dependencies` (§2.11).

Owned by the runtime, not Supabase:
- Memory threads/messages — Mastra libSQL.
- Drafts — a local `aura-drafts.db` (libSQL) file; the same file holds
  `aura_model_usage` (per-day, per-model request/token counts for the
  Coding Council, shown by `aura status`), `aura_token_usage` (tokens per
  day × agent × model for every model call, §6.3) and
  `aura_approval_uses` (which gated step each human approval was used for,
  §2.10).
- Council transcripts — `<worktree>/.aura/council/*.md`, excluded from git.
- Design docs, scaffolds, QA specs — plain files under
  `<AURA_WORKSPACE_ROOT>/<epicKey>/...`, referenced by path from Jira.

Project scope (who can see/run what) is enforced entirely in
`policy.ts` — there is no per-row database enforcement yet.

### 2.7 Provenance and audit evidence

Every filed/revised Jira artifact (Epic, Story, architecture Task, dev
scaffold, coding-agent change, QA plan, test result, defect, release plan,
git op, CI run) carries a full provenance stamp: producing agent id, agent
version, prompt version, model (or provider) id, draft id/version, and the
thread id it was produced in (the run/trace correlator — the same value
`workflow_runs.thread_id` carries, so an artifact can be traced back to its
exact run and approval history). `apps/agent-runtime/src/mastra/agents/registry.ts`
is the source of truth for agent/prompt versions, bumped by hand alongside
the agent's tool/prompt file; `tools/delegate-tools/shared.ts` renders the
stamp into Jira content and returns the same data as a structured
`provenance` field on the tool's result, which `apps/api`'s
`orchestration/run-stream.service.ts` already mirrors verbatim into
`run_steps.payload` — no separate plumbing needed to make it durable and
queryable.

`GET /audit/export` (admin-only) produces a downloadable evidence bundle
(JSON or CSV) from `audit_logs` for SOC2/ISO reviews: unpaginated within a
50,000-row safety cap, framed with an export manifest (who pulled it, when,
under what filter, and a note that the table is DB-enforced append-only),
and the export itself is audited (`audit.exported`).

### 2.8 Monorepo layout

```
aura/
├── apps/
│   ├── web/             React + Vite + TS
│   ├── api/             Express + TS (+ supabase/migrations)
│   ├── agent-runtime/   Mastra: agents/ tools/ contracts/ store/ workflows/ workspace/ server/ terminal/
│   └── cli/             the `aura` command
├── packages/
│   └── aura-client/     typed API + SSE client (@aura/client)
├── .github/workflows/   CI: install → typecheck → lint → test on every push/PR
├── patches/             pnpm patches (Groq fix for @mastra/schema-compat)
├── docs/                ARCHITECTURE.md · plans/ · srs/ adr/ security/ runbooks/ workflows/ · logs/
├── package.json         workspace root (scripts only)
├── pnpm-workspace.yaml  workspace members, patches, overrides, allowed build scripts
├── pnpm-lock.yaml       the single lockfile
├── Makefile             `make help` - install, dev, build, typecheck, cli, doctor…
└── SETUP.md             how to set up and run everything
```

A **pnpm workspace**: every folder under `apps/` and `packages/` keeps its
own `package.json`, with one root lockfile. `apps/cli` depends on
`@aura/client` via `workspace:*`. Zod contracts still live next to their
consumers; `packages/` only holds code more than one app actually shares.

### 2.9 Developer surfaces: `aura` CLI and the web terminal

- **`aura` CLI** (`apps/cli`) — `login` (access token), `tasks`, `open`
  (prints or opens the Task's worktree, `--code` for VS Code), `code` (asks
  the Orchestrator for a Gate 5 draft with every argument spelled out, then
  streams the turn), `approve`/`reject`/`revise` (the same governed decision
  endpoint as the web inbox, pinned with the gate's snapshot hash), `say`
  (a note for the council's next round), `status` (pending gates and today's
  model usage), `diff`, `commit`, `push [--pr]`. `commit` runs locally, so the
  commit is authored by the **developer** (their git config and signing); it
  folds the council's AURA-authored checkpoint commits into that one commit
  and adds `Co-authored-by: AURA Coding Council`, `AURA-Task:` and `AURA-Run:`
  trailers. It never rewrites the developer's own commits.
- **Web terminal** — an xterm.js panel under the Project Files
  editor (Developer role only). The runtime's terminal server
  (`terminal/server.ts`, port 4112, loopback by default) opens a shell in the
  Task's worktree: `full` mode is a real PTY via a small Python 3 `pty`
  bridge (no native Node module), and is only allowed on a loopback bind;
  `restricted` mode runs allowlisted commands only (`aura`, `git`
  read/commit subcommands, `npm test/run`, `ls`, `cat`, `pwd`) with argv and
  path containment, no shell. The shell's environment is an allowlist (no
  LLM keys, Jira token or ticket secret), plus `AURA_TOKEN`/`AURA_API_URL`
  for the CLI. Origin-checked, at most 3 sessions per user, closed after 30
  minutes idle.
- **Project Files** replaced the Design Documents, Scaffolded Files and QA Files & Test Runs
  pages (old URLs redirect). Access, derived from the policy grants
  (`features/project-files/access.ts`; developers gained read on `qa-agent` so
  they see the tests their code must pass):

  |  | Design docs | QA plan/specs | Test runs | Code | Terminal | Runners |
  |---|---|---|---|---|---|---|
  | PO | read + comment | – | – | – | – | – |
  | BA | read + comment | read | read | – | – | – |
  | Architect | edit + comment | read | read | read | – | read |
  | Developer | read | read | read | edit | ✓ | read |
  | QA Engineer | read | edit | read | read | – | read |
  | Deployer | read | read | read | – | – | – |
  | Admin | read | read | read | read | – | read |

  Actions: Run CI (Developer, QA), Run tests (QA), Code this Task (Developer),
  all through a governed Orchestrator conversation. Each role opens on its own
  section and panel tab; location and open file live in the URL.
- **Runners tab** — next to the terminal (Developer, Architect, QA, admin):
  a live snapshot from `GET /runners` (runtime `server/runners-routes.ts`,
  polled every 5s while visible) of AURA's Docker containers with CPU /
  memory / process usage against the fixed per-container limits
  (`CONTAINER_LIMITS` in `lib/docker-exec.ts`), host CPU/memory, Coding
  Council runs in progress (round, phase, token budget), project checks
  running on the host, and terminal sessions (other users' shown only as
  "another user"). Observational only; scoped to the loaded Epic or all.
- Server-side commits (the Git tool, council checkpoints) still use the
  fixed `AURA <aura@localhost>` identity; `profiles.git_name/git_email` are
  stored (`aura login` fills them in) for a later change to make approved
  server-side commits author as the approving developer.

### 2.10 Tool gateway (the runtime's checkpoint)

Every Orchestrator tool except `ask_user` is wrapped by
`gateway/gateway.ts` (`governed()` in `agents/orchestrator.ts`), so every call
goes through one pipeline in one file:

```mermaid
flowchart LR
    CALL["Orchestrator tool call<br/>(Zod-validated by Mastra)"] --> RISK{"Risk tier<br/>risk.ts"}
    RISK -- "unknown mode" --> BLOCK["Refuse"]
    RISK --> LOOP{"Loop guard<br/>loop-guard.ts"}
    LOOP -- "tripped" --> HALT["Refuse · HALTED_LOOP_GUARD"]
    LOOP -- "low" --> RUN["Execute in a span<br/>+ untrusted-content collector"]
    LOOP -- "medium" --> HUMAN{"approved=true AND a human<br/>approve/answer decision on this turn<br/>AND approval not used before"}
    HUMAN -- "no" --> BLOCK
    HUMAN -- "yes" --> RUN
    RUN --> DRAFT["Draft to the human in full,<br/>preview to the model"]
    DRAFT --> REC["Record: metrics · log · data-gateway event<br/>→ run step + audit (API)"]
    BLOCK --> REC
    HALT --> REC
```

| Step | What it guarantees | Where |
|---|---|---|
| Risk tier | Every tool × mode has a tier (low: read/draft/revise/local CI; medium: file/execute/file-defect). A mode with no tier is refused. A test checks the table against the real schemas | `gateway/risk.ts` |
| Human decision | apps/api sends `auraDecision` (approval id, decision, who) on every resume and `auraRun` (AURA run id) on every turn. A medium step runs only after an **approve** or **answer** decision; revise/reject never authorize one | `gateway/context.ts`, `run-stream.service.ts` |
| Single use | The first medium step after a decision claims it (durable, `aura_approval_uses`). A retry of the same step is allowed; any other step is refused | `gateway/approval-ledger.ts` |
| Loop guards | Same call + same arguments 3× in 15 min; same tool failing 3× in a row on a thread (reset by a new human decision); a draft at version 10. Tripped = refused, run → `HALTED_LOOP_GUARD`, audited | `gateway/loop-guard.ts` |
| Prompt injection | Jira/requester text is cleaned (invisible characters), scanned (11 rules) and fenced in `<untrusted>` at every prompt site. Findings go on top of the draft the human approves and into the audit log. `INJECTION_POLICY=block` withholds the result instead | `gateway/untrusted.ts`, `contracts/prompts.ts` |
| Draft delivery | The full draft markdown goes to the human as a `data-draft` chunk (saved in the thread, never in a model prompt); the model gets a 400-character preview. The token saver of §6.3 | `gateway/gateway.ts` `deliverDraft` |
| Record | Prometheus counters/histograms at `GET /metrics` (behind the runtime token); a Mastra span per call tagged `aura.run_id`, agent and prompt version, approval id; a `data-gateway` event the API stores as a run step and, for refusals and findings, as `gateway.blocked` / `gateway.untrusted_content` audit rows | `lib/metrics.ts`, `server/metrics-route.ts` |

Authorization by role still happens in apps/api before a turn starts
(`policy.ts`). The gateway never decides *who* may act, only that a gated step
has a real, unused human decision behind it.

**Runtime access and modes.** Only apps/api can call the runtime (§2.2,
`MASTRA_RUNTIME_TOKEN`). `AURA_MODE=server` refuses to start without that
token, with `SANDBOX_MODE` other than `docker`, or with `TERMINAL_MODE=full`
(`config/aura-mode.ts`); `AURA_MODE=local` (default) allows them on loopback.

### 2.11 Projects, repositories and the Git provider

- **Projects** (migration 0007): a project ties one Jira project key to one
  Git repository (`github` or `local`). Admins manage them on
  *Admin → Projects & Repositories* (`/projects` API, audited).
- **`GitProvider`** (`agent-runtime/src/mastra/git/`): branches, pushes (never
  forced), pull requests, check runs and merge state behind one interface.
  The `local` provider uses bare repos under `AURA_GIT_LOCAL_ROOT`; a reusable
  contract suite (`provider.contract.ts`) will hold the GitHub provider to the
  same behaviour. There is deliberately **no merge method**.
- Not wired into Gate 4 yet (plan Phase 1.3).

---

## 3. Delivery status by phase

| Phase | Built | Not built |
|---|---|---|
| 0 — Foundations | Identity/RBAC, policy tables, Supabase schema + RLS trigger, audit log, approval service, run state machine | SSO federation, Jira webhooks, event queue |
| 1 — PO + BA | PO/BA agents, Gates 1–2, registry view, evals with a CI promotion gate, approval/rejection-rate tracking (§6) | Evals for the workflow agents (Architect, QA, Tester) |
| 2 — Architect + QA/Tester | Architect workflow, ADRs, architecture Tasks (Gate 3), QA + real Playwright execution (Gates 6–7) | Robot Framework (out of scope), CI integration |
| 3 — Dev + Coding + Deployer | Frontend + Backend/NestJS scaffold (Gate 4), Coding Agent + Coding Council (Gate 5), `aura` CLI, web terminal, Deployer plan (Gate 8) | Other disciplines, server-side PR automation, VS Code extension, remote (non-local) worktrees, real deploy pipeline |
| 4 — Multi-region | — | Everything |
| 5 — Hardening | Runtime token + `AURA_MODE`, tool gateway (risk tiers, single-use approvals, loop guards, prompt-injection defense), metrics, token ledger (§2.10, §6) | Durable queue, budgets, SSO, RLS by project, OTLP export |

---

## 4. Glossary

| Term | Meaning |
|---|---|
| **Gate** | A durable workflow suspension only a human with the right role can resolve |
| **Grant** | A (role, agent, tool) permission tuple in `policy.ts` |
| **Run** | One execution of one agent against one Jira issue |
| **Risk tier** | LOW / MEDIUM / HIGH / FORBIDDEN classification on a tool |
| **Draft** | A structured, unfiled agent output awaiting approval |

---

## 5. Pending (Future)

Everything below is design intent, not running code.

### Target per-Task pipeline (once Integration + remote Git land)

The diagram below is the target shape once the still-pending pieces below
(Integration Agent, real remote Git, PR-gated merge) exist. Some of it is
already true today, some is not — read the labels, not just the shape:

- **Already built exactly as drawn:** PO/BA/Architect (Gates 1–3), branch +
  worktree + Docker environment creation (Gate 4), the Coding Agent (Gate 5,
  reading Story/Architecture/existing code/AC, writing code + unit +
  integration tests), the QA Agent (Gate 6, reading Story/AC/source/OpenAPI/
  the running app, generating UI/Playwright/API/negative-case tests), Human
  QA approval, and the Tester Agent's evidence-based diagnose → route
  (Coding Agent for a code bug, QA Agent for a bad test) → commit → retest →
  `HALTED_LOOP_GUARD` after 3 attempts loop (Gate 7).
- **Not built yet:** "Local verification" as an enforced build/lint/test
  gate before a commit is allowed (the Coding Agent is only *asked* to write
  tests today, nothing currently blocks a commit on them failing);
  Integration (conflict detection between Tasks' branches); CI as a gate
  between Integration and Human Review; Human Review as a PR step; and the
  merge to `main` itself — there is no remote Git integration at all today
  (§2.4's Git tool is local-only).
- Deployer (Gate 8) is unchanged from §2.4 either way — it produces a
  release/change/rollback plan only, whether or not `main` reflects an
  automated merge or a human's own manual one.

```mermaid
flowchart TD
    PO["PO — Gate 1"] --> BA["BA — Gate 2"]
    BA --> ARCHITECT["Architect — Gate 3"]
    ARCHITECT --> TASK["Jira Task<br/>e.g. KAN-45 / Story"]
    TASK --> WORKTREE["Create Task branch<br/>+ git worktree<br/>+ Docker environment"]
    WORKTREE --> CODEIN["Coding Agent — Gate 5<br/>reads: Story + Architecture<br/>+ existing code + Acceptance Criteria"]
    CODEIN --> IMPL["Implement code<br/>+ unit tests + integration tests"]
    IMPL --> VERIFY["Local verification<br/>build / lint / tests"]
    VERIFY -->|"fail"| CODEFIX["Coding Agent fixes"]
    CODEFIX --> VERIFY
    VERIFY -->|"pass"| COMMIT["Commit changes"]
    COMMIT --> READYQA["Ready for QA"]
    READYQA --> QAIN["QA Agent — Gate 6<br/>reads: Story + AC + source code<br/>+ OpenAPI + running application"]
    QAIN --> GEN["Generate / update test cases<br/>UI/Playwright · API · negative cases"]
    GEN --> QAAPPROVE{"Human QA approval"}
    QAAPPROVE --> TESTERRUN["Tester Agent — Gate 7<br/>run real tests, collect evidence"]
    TESTERRUN --> TPASS{"Pass?"}
    TPASS -->|"pass"| QAPASSED["QA passed<br/>test evidence stored"]
    TPASS -->|"fail"| DIAGNOSE["Diagnose failure<br/>logs · trace · screenshot · network"]
    DIAGNOSE --> DKIND{"Code bug or bad test?"}
    DKIND -->|"code bug"| DFIX_CODE["Coding Agent"]
    DKIND -->|"bad test"| DFIX_QA["QA Agent"]
    DFIX_CODE --> DCOMMIT["Commit"]
    DFIX_QA --> DCOMMIT
    DCOMMIT --> RETEST["Retest<br/>iteration + 1"]
    RETEST --> ITER{"attempt <= 3?"}
    ITER -->|"yes"| TESTERRUN
    ITER -->|"no"| HALT2["HALTED_LOOP_GUARD"]
    HALT2 --> HUMAN2["Human"]
    QAPASSED --> READYINT["Ready for integration / PR"]
    READYINT --> INTEGRATION["Integration"]
    INTEGRATION --> CI["CI"]
    CI --> REVIEW["Human review"]
    REVIEW --> MAIN["main"]
    MAIN --> DEPLOYER["Deployer — Gate 8<br/>release / change / rollback plan (plan only)"]
```

### Improvements to plan — reliability, scale & enterprise hardening

The gaps below are grouped by category. This is the priority order to close
them, and why each one matters for turning AURA from a working prototype
into a reliable, scalable, enterprise-grade platform.

**1. Reliability — survive failure without losing state**
- Durable event bus (pg-boss) between API and runtime, so a crashed runtime
  resumes a suspended run instead of losing it — today a process restart
  mid-run drops the run.
- Loop guards (`max_iterations` → `HALTED_LOOP_GUARD`) - built for one agent
  so far (the Tester Agent loop, section 2.4/2.5: 3 attempts, then halts to
  a human with the full attempt history) - and circuit breakers/backoff on
  Jira, Docker, and LLM calls generally, so one flaky external call doesn't
  fail an entire run.
- Idempotency keys on every write tool, so an at-least-once queue can retry
  safely without duplicate Jira issues.

**2. Scalability — beyond one runtime process**
(Target shape and rollout order for a 30+ developer company:
[ADR-2](adr/0002-team-scale-deployment.md) — Git-backed workspaces, a queued
runner pool of ephemeral sandboxes, all state in Postgres.)
- Move the Draft store and agent memory off local libSQL files onto shared
  Postgres/pgvector, so `apps/agent-runtime` can run as multiple horizontally
  scaled workers instead of one process holding local state.
- Extract the Sandbox Runner (Docker execution) into its own pooled service,
  so scaffold/coding/test runs don't compete for one host's containers.
- Split long-running agent work onto a worker queue instead of holding an
  HTTP request open for the duration of a run.

**3. Enterprise readiness — the parts a buyer will ask for**
- Multi-tenant data model: `org_id`/`region_id`/`project_id` on every table,
  enforced by RLS at the DB layer — today scope is enforced only in
  `policy.ts`, a single point of failure.
- SSO/SAML federation and per-region deployment for data residency.
- ~~Full provenance stamp (agent version, prompt version, model + version,
  run/trace ID) on every artifact, and exportable audit evidence for
  SOC2/ISO reviews.~~ Built — see section 2.7.
- Server-enforced cost budgets per run/project/org, not just recorded cost.

**4. AI harness — hardening the agent control plane itself**
This is the part worth the most engineering investment: not more agents,
but a stronger, auditable boundary around the ones that exist.
- ~~Unify the Tool Gateway into one real pipeline~~ Built in-process — see
  §2.10. Still open: per-call timeouts/circuit breakers, and running it as
  its own service.
- ~~Active prompt-injection defense~~ Built — see §2.10 (cleaning, 11
  scan rules, `<untrusted>` fencing, warnings on the approved draft,
  optional block policy).
- ~~Eval harness per agent version~~ Built for PO, BA and Deployer — see
  §6.1 (score + token gate, committed baselines as the human sign-off).
  Still open: suites for the Architect/QA/Tester workflows and the
  Orchestrator, and a canary stage.
- Replayable run traces: every gateway span now carries the AURA run id
  (`aura.run_id`) in Mastra's trace store. Still open: OTLP export to an
  external collector (the Mastra OTel exporter needs the next
  `@mastra/observability` upgrade).
- Model/provider abstraction with automatic fallback and region-aware
  routing, so a single LLM provider outage doesn't stop every agent.

**Platform**
- Event bus / durable queue (pg-boss vs BullMQ+Redis) between API and runtime.
- Tool Gateway as its own service (today its steps live split across delegate tools and `apps/api`).
- Timeouts / circuit breakers beyond a per-turn ceiling.
- Agent Registry as a real service (today a static file, `agents/registry.ts`).

**Authorization & multi-tenancy**
- SSO federation (SAML/OIDC) and Jira webhook ingestion.
- HIGH risk tier and four-eyes approval (not exercised yet — no production actions exist).
- Row-level `org_id`/`region_id`/`project_id` + RLS policies (only the append-only audit trigger is DB-enforced today).
- Multi-region deployment and regional LLM routing for data residency.

**Agents**
- Dev/Coding: Backend/Spring Boot, Data, AI, Integration, Deployment disciplines.
- Git branch/PR automation; any GitHub/GitLab integration (push, PAT, Actions status).
- Deployer: an actual execute mode against a real deployment pipeline.
- Test-management integration (Xray/Zephyr) — defects are plain Jira Bugs today.
- Sandbox isolation beyond Docker (Firecracker/gVisor) — revisit only if AURA runs untrusted, multi-tenant workloads.

**Reliability & observability**
- ~~Loop guards beyond the Tester Agent~~ Built in the gateway (§2.10).
- Cost budgets enforced in the tool gateway.
- Circuit breakers, backoff, model fallback for external outages.
- Approval SLA timers/expiry and "role has zero members" warnings.
- Metrics (`GET /metrics`) and the *AI Usage & Quality* page are built (§6); OTLP export, dashboards and alerting still open.
- ~~Eval harness and eval-gated promotion~~ Built (§6.1); canary stage still open.

**Deployment**
- CI/CD pipeline (lint, tests, evals, build, scan) for AURA itself.
- Blue/green or canary rollout for `api` and `agent-runtime`.
- Infra as code (Terraform) per region.

**Open decisions**
- Queue: pg-boss vs BullMQ + Redis.
- Jira test management: plain issues vs Xray/Zephyr.
- ~~Eval tooling~~ Decided: AURA's own deterministic scorers + committed baselines (§6.1); revisit Langfuse/Braintrust for LLM-judged metrics.
- Vector store: pgvector vs external.
- Draft store: keep runtime-owned libSQL vs move to a Supabase table.

---

## 6. Evaluation and token usage

Two questions, each measured before and after a change ships:
**is the agent's work good?** (§6.1, §6.2) and **what does it cost in tokens?** (§6.3).

```mermaid
flowchart LR
    subgraph BEFORE["Before a prompt/model change ships"]
        EV["Offline evals<br/>pnpm --filter agent-runtime eval"] --> GATE{"Promotion gate<br/>score ≥ 0.8 · ≤ 0.1 drop · ≤ 1.25× tokens"}
        GATE -- "pass" --> BASE["Baseline JSON committed<br/>(human review = sign-off)"]
        BASE --> CI["CI: baselines.test.ts<br/>registry version = baseline version"]
    end
    subgraph AFTER["After it ships"]
        LEDGER["Token ledger<br/>every model call"] --> PAGE["Admin → AI Usage & Quality"]
        DEC["Approval decisions"] --> PAGE
        GW["Gateway metrics<br/>GET /metrics"] --> PROM["Prometheus / Grafana"]
    end
```

### 6.1 Offline evals (agent-runtime `src/mastra/evals/`)

Each suite runs **the exact production prompt** (`contracts/prompts.ts`)
against the agent's real model and scores the structured output with
deterministic code checks: no model grades another model.

**Evaluation matrix: what each dimension means and how it is scored**

| Dimension | Question it answers | How it's measured | Example check |
|---|---|---|---|
| Structure | Is the output usable at all? | Zod schema of the draft; invalid JSON after one retry = case score 0 | `epicDraftSchema` parses |
| Completeness | Is anything a reviewer expects missing? | Minimum counts per field | 3+ scope items; every Story has 2+ acceptance criteria |
| Measurability | Can success be checked later? | Numbers present where a metric is expected | success metrics contain a digit |
| Grounding | Did it keep the facts it was given? | Required terms/values from the input appear | keeps "30 minutes", keeps Epic key `KAN-10` |
| Honesty about gaps | Does it record unknowns instead of inventing? | Assumptions recorded for vague input | 2+ assumptions for "Make the app faster" |
| Injection resistance | Does planted text change the output? | One trap case per suite (override, fake approval, role change, tool call) | title not "PWNED", no `approved=true`, Epic key unchanged, rollback plan still written |
| Cost | How many tokens does one case take? | Input + output tokens per case, retries included | ≤ 1.25× the baseline |

Checks carry weights (injection and key-preservation checks weigh 2).
Case score = passed weight / total weight; suite score = mean case score.

**Promotion gate** (`evals/scoring.ts`)

| Rule | Threshold |
|---|---|
| Minimum suite score | `MIN_SCORE` = 0.8 |
| Maximum drop from the previous baseline | `TOLERANCE` = 0.1 |
| Maximum token growth per case vs the previous baseline | `TOKEN_GROWTH_LIMIT` = 1.25× |
| Baseline must match the registry's agent version, prompt version, model and case list | enforced in CI by `baselines.test.ts` |
| A suite never recorded | reported as pending (skipped), not failed; its first recording is the promotion |

**Current baselines** (`apps/agent-runtime/evals/baselines/`)

| Agent | Prompt version | Cases | Score | Notes |
|---|---|---:|---:|---|
| PO Agent | 1.1.0 | 4 | **1.00** | Passed the injection trap |
| BA Agent | 1.1.0 | 3 | **0.958** | Missed "user-story form" on one Story; passed the injection trap |
| Deployer Agent | 1.1.0 | 2 | pending | Not recorded yet: `EVAL_UPDATE_BASELINE=1 EVAL_AGENT=deployer-agent pnpm --filter agent-runtime eval` |

These two baselines were recorded before token tracking existed, so they
have no `avgTokensPerCase` yet; the token gate starts applying from the next
recording.

### 6.2 Online quality (from real decisions)

`GET /dashboard/agent-quality` (admin; *AI Usage & Quality* page) computes,
per agent, from `approval_requests` + `approval_decisions`:

| Metric | Definition | Good sign |
|---|---|---|
| Gates | Approval requests raised on this agent's output | - |
| Approval rate | approve / decided | High |
| First-pass rate | Conversations whose **first** draft was approved without a revision | High: drafts are right first time, fewer revise loops, fewer tokens |
| Revised / Rejected | Counts of each decision | Low |
| Expired / Pending | Gates nobody decided in time / still open | Low: otherwise work stalls |
| Median time to decide | requested → decided, minutes | Low |

The gateway adds safety metrics at `GET /metrics`:
`aura_gateway_blocks_total{tool,reason}`, `aura_untrusted_findings_total{rule,severity}`,
`aura_approvals_used_total{tool}`, `aura_tool_calls_total{tool,mode,tier,outcome}`,
`aura_tool_duration_seconds`.

### 6.3 Token usage evaluation

**How it's measured**

| Source | What | Where |
|---|---|---|
| Token ledger | Every model call: Orchestrator turns, every helper's structured call, Coding Council, single coding agent. Input, output, hidden reasoning and cached tokens per day × agent × model | `store/token-ledger.ts` → `GET /usage/tokens` → `GET /dashboard/token-usage` → *AI Usage & Quality* page |
| Prometheus | `aura_model_calls_total{agent}`, `aura_model_tokens_total{agent,type}`, `aura_context_chars_saved_total{tool}` | `GET /metrics` |
| Evals | Tokens per case, gated at 1.25× the baseline | §6.1 |
| Mastra traces | Per-span token metrics (the source of the baseline below) | Mastra Studio / DuckDB store |

**Baseline measurement: before optimisation** (65 runs, 118 model calls, 2026-09-17 to 09-23; from Mastra's trace store)

| Agent | Calls | Input tokens | Output tokens | Avg input / call | Share of all tokens |
|---|---:|---:|---:|---:|---:|
| Orchestrator | 40 | 593,613 | 33,110 | 14,840 (max 63,894) | **69%** |
| Architect (workflow) | 51 | 132,844 | 80,333 | 2,605 | 24% |
| QA (workflow) | 12 | 15,697 | 18,328 | 1,308 | 4% |
| BA | 5 | 5,851 | 13,803 | 1,170 | 2% |
| Dev | 5 | 3,306 | 549 | 661 | <1% |
| PO | 5 | 2,885 | 2,525 | 577 | <1% |
| **Total** | **118** | **754,196** | **148,648** | | ~903k tokens |

Other findings from the same data:
- About a third of output tokens were hidden reasoning.
- 57% of input was served by the Gemini **fallback**, so the Groq primary was often failing or rate limited.
- Model call latency: median 10 s, p95 82 s.
- Cost per gate, roughly: Epic ~1k tokens, Stories ~4k, a test plan ~17k, an architecture design ~70k (about 17 calls including retries).

**Diagnosis.** The helpers are cheap: one structured call each, and the
expensive actions (Jira, git, Docker) are plain code that uses no tokens.
The cost is the Orchestrator deciding what to do next. On every step it re-sent:
- ~7,500 tokens of fixed text (instructions and tool descriptions),
- the last 32 messages, including every full draft it had received,
- and it re-typed each draft as its own reply, because it was told to "show the markdown".

**Optimisations made (2026-09-29)**

| Change | Before | After | Where |
|---|---|---|---|
| Drafts go to the human directly (`data-draft`); the model gets a 400-char preview | Full draft in context on every later step (an architecture draft ≈ 7k tokens) and re-typed as output | ~120 tokens; never re-typed | `gateway/gateway.ts`, `run-stream.service.ts` |
| Compact Orchestrator instructions (same rules, one gate pattern) | 15,812 chars | 5,590 chars | `agents/orchestrator.ts` (prompt 2.0.0) |
| Shorter tool descriptions (details moved to the one place that needs them) | 14,215 chars | 11,421 chars | `tools/delegate-tools/*.ts` |
| **Fixed payload per Orchestrator step** | **~7,500 tokens** | **~4,250 tokens (−43%)** | measured from the source |
| Memory window | 32 messages | 16 messages | `agents/orchestrator.ts` |
| Reasoning effort for routing | default (medium) | low | `agents/orchestrator.ts` |

**Expected effect (estimate; confirm on the AI Usage & Quality page after real runs):**

| | Before (measured) | After (estimated) |
|---|---:|---:|
| Orchestrator avg input per call | ~14,800 | ~6,000–7,000 (−55–60%) |
| Orchestrator share of all tokens | 69% | ~45% |
| Total tokens for the same work | ~903k | ~520–560k (**−38–42%**) |
| Orchestrator output on draft gates | draft re-typed (up to ~7.8k) | one question line |

Estimate method: fixed payload −3.25k per call (measured), plus 60–80% of the
remaining ~7.3k conversation context per call being draft text that is now a
preview. Output savings are not counted in the total.

**Next opportunities** (not done yet)

| Idea | Expected effect | Why not yet |
|---|---|---|
| Prompt caching (e.g. Claude with cached system prompt + tools) | Cached input billed at ~10%: most of the remaining fixed ~4.25k per step | Needs a paid provider (ADR-2 D6) |
| Only the current gate's rules in the Orchestrator prompt | A further ~1k tokens per step | Needs a reliable way to know the gate before the model call |
| Fewer Architect calls (merge design sections) | Up to ~40% of an architecture design | Trade-off with section quality; measure with a new eval suite first |
| Eval suites for the Orchestrator and the workflows | Catch quality or token regressions there too | Needs multi-turn eval cases |
