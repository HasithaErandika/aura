# ADR-2. Team-scale deployment: central control plane, Git-backed workspaces, pooled sandbox runners

**Status:** Proposed (2026-09-25). Nothing in this ADR is built yet. Today AURA runs in
**local mode**: one developer's machine runs `web`, `api` and `agent-runtime`, and Task code lives
on that machine's disk (`.workspaces/`). This ADR decides the target shape for a company of **30+
developers** and the order in which to get there.

## Context

The current design (`docs/ARCHITECTURE.md` §2, [plan: aura-code-cli-council](../plans/aura-code-cli-council.md))
assumes the code and the agent runtime sit on the developer's own machine. Several pieces depend on
that assumption:

- **Workspaces are local directories.** Gate 4 scaffolds into `<AURA_WORKSPACE_ROOT>/<EPIC>/dev/<discipline>/`,
  and every Task gets a git worktree there (`workspace/dev-workspace.ts`). `aura open`/`diff`/`commit`/`push`
  use the absolute path the API returns (`GET /dev-workspace/tasks/:taskKey`).
- **Code runs inside the runtime process's machine.** Council checks run on the host by default
  (`SANDBOX_MODE=host`, `lib/sandbox.ts`). Scaffolds, Claude Code/Codex and Playwright tests run in
  Docker on that same machine (`lib/docker-exec.ts`).
- **The web terminal is a full shell** on that machine when bound to loopback (`terminal/server.ts`).
- **State is in local files:** Mastra memory (`mastra.db`), drafts and model usage (`aura-drafts.db`),
  and council notes (in memory).
- **Long work runs inside a request.** A council run executes inside one Orchestrator turn that the
  API streams, bounded by `RUN_TURN_TIMEOUT_MS`.
- **Models are free-tier** Groq/Gemini chains with small daily quotas.

That is right for one developer, and wrong for 30. On one shared server it would mean:
- every developer's code on one disk,
- one developer's agent-written `npm test` able to reach another's files,
- a full shell for everyone,
- one process that can't scale out,
- free-tier quotas exhausted within minutes.

Constraints that don't change: governance stays in `apps/api` (policy, approvals, audit); humans
approve every consequential action; the runtime never holds user credentials.

## Decision

Split AURA into a **central control plane** and a **pooled execution plane**, and make **Git the
only home of code**.

```
                  Developers (30+): own IDE + `aura` CLI, SSO login
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        ▼                         ▼                          ▼
   web (static, CDN)     api ×N (load balanced)         Git host (GitHub/GitLab)
                                  │                          ▲
                                  ▼                          │ push Task branch / PR
                   agent-runtime ×N (agents, workflows)      │
                                  │ enqueue                  │
                          job queue (Redis)                  │
                                  │                          │
                     runner pool (autoscaled) ───────────────┘
                     one ephemeral sandbox per job:
                     clone → scaffold / code / check / test → push → destroy
                                  │
      managed Postgres (Supabase + Mastra storage + drafts) · Jira · Claude API
```

### D1. Git is the only home of code (remote mode)

- Each discipline's base repo is a real remote repository, one per Epic × discipline. Gate 4 creates
  it on the Git host instead of `git init` on disk.
- Each Task is a branch, `feature/<TASK>`. Every job that touches code makes a **fresh shallow clone**
  of that branch, does its work, **pushes**, and discards the clone.
- Council checkpoint commits are pushed to the Task branch. `aura commit` still folds them into one
  commit authored by the developer before the PR.
- Developers get the code with `git pull`, or a new `aura pull <TASK>` that clones or fetches the
  branch into their own machine. `GET /dev-workspace/tasks/:taskKey` returns the **branch and
  repository URL**, not a server path.
- `aura push --pr` stays on the developer's machine with their own credentials. Pushes AURA makes
  itself use a **GitHub App** (or GitLab bot) installation token, never a personal token.
- The web file browser (Project Files) reads a branch through the Git host's API, or a cached
  read-only clone, rather than a server directory.

### D2. Code runs only in ephemeral, isolated sandboxes on a runner pool

- A new **Runner service** (the "extract the Sandbox Runner into its own pooled service" item in
  `docs/ARCHITECTURE.md` §5) takes jobs from the queue: `scaffold`, `council`, `check`, `test`, `ci`,
  `external-coding-cli`.
- Each job gets **one fresh container**:
  - the existing resource limits (`CONTAINER_LIMITS`: 2 CPU, 2 GB, 512 PIDs),
  - network restricted to package registries, the Git host and the LLM provider,
  - no host mounts beyond its own scratch directory,
  - destroyed afterwards.
- `SANDBOX_MODE=host` and `TERMINAL_MODE=full` become **local-mode-only** settings, and the server
  build refuses them.
- Runners are plain Docker hosts to start with (2–3 VMs), and **Kubernetes Jobs** once load justifies
  it. The job contract stays the same either way.
- **Why Docker here, when it's optional locally:** with many developers sharing hardware,
  agent-written code must not be able to reach other developers' work or the host. That's the only
  reason for the container, and at this scale it's required.

### D3. Long work is queued, not held open in a request

- The council, scaffolds, tests and CI become **queued jobs** (Redis + BullMQ, or a Postgres-backed
  queue). The approved Gate 5 `execute` enqueues and returns a job id. Progress streams from the
  runner via a pub/sub channel that the API relays as the existing SSE events (`council`, `progress`).
- Concurrency limits apply per runner, per developer and **per model provider**. The last one
  replaces today's in-process rate-limit waits.
- This removes the `RUN_TURN_TIMEOUT_MS` ceiling for coding work. Approvals still gate each job, the
  same as today.

### D4. All state in managed Postgres

- Mastra storage moves from libSQL files to Postgres (Mastra's Postgres store). So do drafts and
  model usage (the `aura_drafts` and `aura_model_usage` tables), and council notes (currently
  in-memory).
- Supabase remains the system of record for identity, approvals, runs and the append-only audit log,
  as today.
- After this, `agent-runtime` and `api` are stateless and run as 2+ replicas behind a load balancer.

### D5. Developers work in their own IDE; the web terminal is restricted

- The primary interface is the developer's IDE plus the `aura` CLI, with personal access tokens as
  today, plus `aura pull`. The planned VS Code extension (Phase 5 of the plan) fits unchanged.
- The **web terminal** attaches to the Task's own sandbox container in `restricted` mode (the
  allowlist in `terminal/restricted.ts`), or is switched off. It is never a shell on a shared host.
- The **Runners** tab reads the runner pool's job and container state instead of local `docker ps`.

### D6. Paid models with budgets

- The council moves to **Claude** (`anthropic/claude-sonnet-5` first in each `COUNCIL_*_MODEL_IDS`
  list in `agents/registry.ts`), with free-tier models kept as fallbacks.
- Anthropic **prompt caching** is on for each agent's system prompt (see the note in `config/models.ts`).
- Token budgets are enforced **per run** (already built), **per developer per day** and **per team per
  month** (new), all visible in `aura status` and the Runners tab.

### D7. Identity and access

- Sign-in through **SSO** (Supabase SAML/OIDC). AURA roles are mapped from IdP groups, not assigned
  by hand.
- Personal access tokens stay, with a shorter default expiry and an admin view to revoke them.
  Terminal-kind tokens are revoked when the session closes instead of relying on their 8h expiry.
- Project-level scoping (the missing `projects` / membership table noted in `docs/ARCHITECTURE.md`
  §2.6) becomes a prerequisite once several teams share one deployment.

### D8. Hosting shape, sized to the company

| Size | Shape |
|---|---|
| Up to ~100 developers | web on a CDN; `api` + `agent-runtime` on managed containers (ECS / Cloud Run / Fly) or 2 VMs with Docker Compose behind Caddy/Nginx; 2–4 runner VMs; managed Postgres; managed Redis |
| Beyond ~100, or several teams | Kubernetes: `api`/`agent-runtime` Deployments with HPA; runners as Kubernetes Jobs on an autoscaled node pool; same managed data services |

## Rollout order

Each step is useful on its own. Local mode keeps working throughout, selected by configuration
(`AURA_MODE=local|server`).

1. **Remote mode (D1).** Git host integration (GitHub App), Task branches pushed, `aura pull`, and
   the web file browser reading from Git. *Unblocks everything else.*
2. **Runner service and queue (D2, D3).** Move scaffold, council, checks and tests into queued jobs
   in ephemeral containers, with progress over pub/sub → SSE.
3. **Postgres for all runtime state (D4)**, then run 2+ `api` / `agent-runtime` replicas.
4. **SSO, budgets and paid models (D6, D7).**
5. **Web terminal attached to sandbox containers, Runners tab backed by the pool (D5).**
6. **Kubernetes (D8)**, only when load requires it.

## Consequences

**Positive**
- No developer's code sits on a shared disk, and agent-written code can't reach anything but its
  own throwaway container.
- Each part scales on its own: stateless `api`/`agent-runtime` replicas, and runners that follow
  queue depth.
- Developers keep their own IDE, Git workflow, credentials and commit identity. AURA fits into the
  normal PR flow instead of replacing it.
- Long coding runs survive browser disconnects and API restarts.
- Governance is unchanged: every job still starts from a recorded human approval, and the audit log
  covers it.

**Negative**
- Real infrastructure to run: a Git App, Redis, runner hosts, managed Postgres.
- Every job pays for a fresh clone and dependency install. This needs a per-repo dependency cache
  on the runners, since today's shared `node_modules` symlink does not carry over.
- Paid model spend, which needs the budgets in D6 to stay predictable.
- Two modes (local and server) to keep working. Mitigation: one job contract, two executors (local
  process vs runner).

**Not decided here**
- Stronger isolation than containers (gVisor / Firecracker), revisited if AURA ever runs untrusted,
  multi-tenant customer work (same stance as ADR-1).
- Git host specifics beyond "GitHub App or GitLab bot".
- Multi-region (Phase 4 in `docs/ARCHITECTURE.md` §3).
