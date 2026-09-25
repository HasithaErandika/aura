# AURA Code — `aura` CLI, web terminal, and the Coding Council

Status: **Implemented (Phases 1–4); Phase 5 not started** · last updated 2026-09-25
Related: [ARCHITECTURE.md](../ARCHITECTURE.md) §2.2, §2.4, §2.8, §2.9 · [SETUP.md](../../SETUP.md)

This document records **what was built and why**, including where the result differs from the
original proposal, and ends with an assessment of the Coding Council's efficiency and the
alternatives.

---

## 1. Goal

Give the Developer role a way to work on a Jira Task from their own tools instead of only a
browser page, and replace the single-shot Coding Agent with a small team of agents that
**discuss** the work (plan → critique → implement → review) before a human accepts it.

```bash
aura login                         # once - paste a token from the web Profile page
aura tasks --epic KAN-36           # the Epic's Tasks and their status
aura code KAN-45                   # Coding Council drafts → Gate 5 → approve → agents discuss, live
aura say "use zod for the form"    # steer the next council round
aura open KAN-45 --code            # open the Task's worktree in VS Code
aura diff && aura commit           # one commit authored by YOU, AURA trailers attached
aura push --pr                     # your own git credentials, PR via gh
```

The same flow also works inside the **web terminal** under Project Files, where the
CLI is already signed in.

### Principles kept

- **Governance is unchanged.** Every consequential action still goes through `apps/api` (auth,
  policy, approvals, audit). The CLI and the terminal have no privilege the web app lacks.
- **Humans stay last.** Gate 5 approval starts the council; the developer reviews and commits
  the result.
- **Free-tier first, Claude later** by editing three model lists in the agent registry.

---

## 2. Decisions (as built)

| # | Decision | Built as | Differs from the original proposal? |
|---|---|---|---|
| D1 | Primary developer interface | `aura` CLI (`apps/cli`) | — |
| D2 | IDE in the browser | Keep **CodeMirror** and add an **xterm.js terminal** under it, on **Project Files** (the merged design + QA + code workspace that replaced Design Documents, Scaffolded Files and QA Files & Test Runs) | Yes: Monaco was proposed; kept CodeMirror per the request "under CodeMirror". Monaco is deferred. |
| D3 | CLI auth | Personal access tokens `aura_pat_…` (hashed, expiring, revocable, audited) | Added: a token cannot mint another token (browser-session-only) |
| D4 | Web-terminal auth for the CLI | An 8h token of kind `terminal`, minted per terminal session and passed **encrypted** in the ticket → `AURA_TOKEN` in the shell | New: no `aura login` needed in the web terminal |
| D5 | Coding models | Free tier (Groq/Gemini fallback chains per role), defined in the agent registry (`COUNCIL_*_MODEL_IDS`, `agents/registry.ts`) like every other agent's model; Claude = put `anthropic/claude-sonnet-5` first in each list | Yes: env-var overrides were dropped, so all model choices live in one place |
| D6 | Council checks | Host execution of fixed check **ids** (`SANDBOX_MODE=host`), Docker optional | Yes: no `install` check (a worktree's `node_modules` is a symlink shared with other Tasks) |
| D7 | Commit authorship | CLI commits locally **as the developer** with `Co-authored-by`/`AURA-Task`/`AURA-Run` trailers; council checkpoints are AURA-authored and folded in by `aura commit` | Server-side commits still use the AURA identity (see §8) |
| D8 | Terminal transport | Browser → **runtime** WebSocket (port 4112) with an API-signed ticket; no API proxy | Yes: simpler than proxying WebSockets through the API; API still gates and audits |
| D9 | PTY | Python 3 `pty` bridge | Yes: `node-pty` needs a native build that fails without a toolchain (verified on this machine) |
| D10 | Planner output | **Markdown** plan (not JSON); only the Reviewer returns strict JSON | Yes: the Reviewer's verdict is the only output that drives control flow, so it is the only one that needs a schema |
| D11 | Package management | **pnpm workspace** + Makefile | New |

---

## 3. Architecture

```
 browser: Project Files ────┬─ REST/SSE ─────────────► apps/api ── auth (JWT | aura_pat), policy,
   CodeMirror + xterm.js    │                            │          approvals, audit, tickets
                            └─ WS ?ticket= ─┐            ▼
 aura CLI ── REST/SSE (@aura/client) ─────► apps/api ─► apps/agent-runtime
                                            │           ├─ Orchestrator → delegate_to_code(provider: council)
                                            │           │    └─ workflows/coding-council.ts
                                            │           │         Planner ⇄ Reviewer → Implementer ⇄ Reviewer
                                            │           │         lib/sandbox.ts (typecheck/build/test/lint)
                                            └──────────►├─ terminal/server.ts :4112 (PTY or restricted)
                                                        ▼
                         .workspaces/<EPIC>/dev/<discipline>/.worktrees/<TASK>   (git worktree, feature/<TASK>)
```

---

## 4. Components as built

### 4.1 Access tokens & git identity — `apps/api`

| Piece | File |
|---|---|
| Table `access_tokens` (hash, prefix, `kind` personal/terminal, expiry, revoked, last used) + `profiles.git_name/git_email` | `supabase/migrations/0006_access_tokens_git_identity.sql` |
| Create / list (personal only) / revoke / resolve | `src/modules/identity/tokens.service.ts` |
| Bearer `aura_pat_…` → owner → same profile/role checks; `req.user.via` = `session`\|`token` | `src/middleware/auth.ts` |
| `GET /me` (+ `gitIdentity`), `PUT /me/git-identity`, `GET/POST /me/tokens`, `DELETE /me/tokens/:id` | `src/modules/identity/me.router.ts` |
| Profile → Access tokens card (create, copy once, list, revoke) | `apps/web/src/features/profile/AccessTokensCard.tsx` |

### 4.2 `packages/aura-client` (`@aura/client`)

A framework-free typed client: `me`, `setGitIdentity`, `jira.epic/issue`, `devWorkspace.findTask`,
`threads.list/create/send` (SSE), `approvals.list/get/decide` (SSE), `council.note/usage`, plus
`readSse`. The `TurnEvent` union mirrors the API's SSE events: `run`, `text`, `tool`, `progress`,
`council`, `gate`, `decision`, `error`, `done`.

### 4.3 `apps/cli` — `aura`

| Command | Server call |
|---|---|
| `login [--api] [--token] [--no-git-identity]` (not needed in the web terminal) | `GET /me`, `PUT /me/git-identity` |
| `logout`, `whoami` | `GET /me` |
| `tasks [--epic]` | `GET /jira/epics/:key` |
| `open [TASK] [--code\|--path]` | `GET /dev-workspace/tasks/:taskKey` |
| `status [TASK]` | `GET /approvals`, `GET /council/usage` |
| `code [TASK] [--epic] [--provider council\|mastra] [--note] [--new-thread]` | `POST /threads`, `POST /threads/:id/messages` |
| `approve [ID] [--answer]` · `reject [ID] -r` · `revise "<feedback>"` | `GET /approvals/:id`, `POST /approvals/:id/decide` (with `snapshotHash`) |
| `say "<text>" [--task\|--draft]` | `POST /council/:draftId/notes` |
| `diff [--stat] [--uncommitted]` · `commit [-m] [--no-squash]` · `push [--pr] [--remote]` | local `git` / `gh` |

- Config: `$XDG_CONFIG_HOME/aura/config.json` (mode 0600) holds `apiUrl`, `token`, and per-Task
  `threadId`/`lastApprovalId`/`lastDraftId`. `AURA_TOKEN`/`AURA_API_URL` override it and are never
  written to disk.
- Inside a worktree, the Task is inferred from the `feature/<TASK>` branch.
- `code` spells out every `delegate_to_code` argument in its message, which mitigates the
  dropped-`mode` failure recorded in the KAN-45 log.
- After a gate, it offers to decide it in place (`--no-prompt` to skip).

### 4.4 Coding Council — `apps/agent-runtime`

| Piece | File |
|---|---|
| Loop, budget, retries, checkpoints, transcript, streaming | `workflows/coding-council.ts` |
| Planner / Implementer / Reviewer | `agents/council-agents.ts` |
| Tools: `list_files`, `read_file`, `search_files` (read-only); `write_file`, `edit_file`, `run_check` (Implementer only) | `tools/council-tools.ts` |
| Check ids → fixed argv from the project's `package.json`, host or docker | `lib/sandbox.ts` |
| Verdict schema, turn event | `contracts/council.ts` |
| Model chains per role (`COUNCIL_PLANNER/IMPLEMENTER/REVIEWER_MODEL_IDS`) · `modelChain()` | `agents/registry.ts` · `config/models.ts` |
| Human notes queue (in memory) · daily model usage (libSQL) | `store/council-notes.ts` · `store/usage-store.ts` |
| `POST /council/:draftId/notes`, `GET /council/usage` (API proxies them with a role check and an audit record) | `server/council-routes.ts`, `apps/api/src/modules/council/council.router.ts` |
| Provider `council` in `delegate_to_code`; the Task is not moved to In Review unless the Reviewer approved | `tools/delegate-tools/code.ts`, `contracts/coding-drafts.ts`, `agents/orchestrator.ts` |

**Loop**

```
PLAN     Planner (read-only tools) → Markdown plan
         Reviewer (no tools, JSON) critiques the plan         ≤ COUNCIL_PLAN_ROUNDS (default 1)
         Planner revises
BUILD    Implementer (≤ COUNCIL_IMPLEMENTER_STEPS tool steps)
round N: run all checks (typecheck → build → test → lint, stop at first failure)
         checkpoint commit "council: round N" (AURA identity)
         Reviewer on git diff since start + check output → APPROVE | CHANGES
         failing check ⇒ CHANGES, always
         CHANGES → Implementer fixes ONLY listed issues (≤ COUNCIL_FIX_STEPS)   ≤ COUNCIL_MAX_ROUNDS (default 2)
DONE     approved | round limit | token budget → summary, open issues, transcript
```

- **Free-tier resilience:** turns run strictly one at a time. Each role has its own fallback
  chain. When the whole chain fails with a provider error, the turn waits and retries: rate
  limits honor `retry-after`, other API errors wait 20s, capped at 30s and 2 retries. That wait
  shows as a `waiting` event. Retrying on any API error, not just 429, matters because the error
  that surfaces is the *last* model's: in testing, Gemini's per-minute limit pushed a call onto a
  Groq model with an expired key.
- **Budget:** `COUNCIL_TOKEN_BUDGET` stops the run cleanly and commits the work so far.
- **Model attribution:** each turn reports the model that actually answered, as the provider
  reported it after any fallback.
- **Streaming:** each turn is a `data-council-turn` chunk. The API stores it as a run step with
  `source: "council"` and forwards it as SSE event `council`. The CLI prints a threaded
  discussion; the web shows it in the chat as a live log and in the Run Console timeline.

### 4.5 Web terminal

| Piece | File |
|---|---|
| Ticket: role check (Developer), audit `terminal.session.start`, 60s single-use HMAC ticket, encrypted CLI token | `apps/api/src/modules/terminal/terminal.router.ts` |
| WebSocket server (`TERMINAL_HOST`/`TERMINAL_PORT`, origin check, 3 sessions/user, 30-min idle) | `apps/agent-runtime/src/mastra/terminal/server.ts` |
| Ticket verify + token decrypt | `terminal/ticket.ts` |
| Full mode: Python 3 `pty` bridge with resize | `terminal/pty.ts` |
| Restricted mode: allowlisted argv runner, path containment | `terminal/restricted.ts` |
| xterm.js panel under the CodeMirror editor; refreshes the file tree after output | `apps/web/src/features/project-files/TerminalPanel.tsx`, `BottomPanel.tsx` |

`TERMINAL_MODE` defaults to `full` on a loopback bind and `restricted` otherwise. A full shell on a
non-loopback bind is refused, and Windows is always restricted. The shell environment is an
allowlist, so no LLM keys, Jira token or secrets reach it.

### 4.6 Tooling

A pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`), one `pnpm-lock.yaml`. The Groq
patch moved from patch-package to pnpm `patchedDependencies`, pinned by an `overrides` entry. A
`Makefile` wraps it: `install`, `env`, `dev`, `runtime`/`api`/`web`, `build`, `typecheck`, `lint`,
`cli`, `terminal-secret`, `doctor`, `clean`.

---

## 5. Configuration

| Where | Variables |
|---|---|
| `apps/agent-runtime/.env` | `COUNCIL_PLAN_ROUNDS`, `COUNCIL_MAX_ROUNDS`, `COUNCIL_IMPLEMENTER_STEPS`, `COUNCIL_FIX_STEPS`, `COUNCIL_TOKEN_BUDGET`, `SANDBOX_MODE`, `ANTHROPIC_API_KEY` (later), `TERMINAL_TICKET_SECRET`, `TERMINAL_HOST`, `TERMINAL_PORT`, `TERMINAL_MODE`, `TERMINAL_ALLOWED_ORIGINS` |
| `apps/api/.env` | `TERMINAL_TICKET_SECRET` (same value), `TERMINAL_WS_URL`, `TERMINAL_CLI_API_URL`, `RUN_TURN_TIMEOUT_MS` (raise for council runs, e.g. 1800000) |

All are documented in each `.env.example`. The council's **models** are not env settings: they
live in `agents/registry.ts` (`COUNCIL_*_MODEL_IDS`). **Moving to Claude:** set
`ANTHROPIC_API_KEY` and put `anthropic/claude-sonnet-5` first in each of those three lists.

---

## 6. Status and verification

| Phase | Scope | Status |
|---|---|---|
| 1 | Access tokens, git identity, worktree lookup, `@aura/client`, Profile tokens card | Built, typechecked. Migration 0006 **not yet applied** to Supabase; not run against a real database. |
| 2 | `aura` CLI | Built. End-to-end against a mock API and a real git worktree: login, open, code (streamed council render + gate), diff, commit (squash + trailers + exclusions). |
| 3 | Coding Council | Built. One real run on a demo Task: plan → plan review (APPROVE) → build → `test` check passed → checkpoint commit. The code review then failed on an **expired `GROQ_API_KEY`**; the retry and attribution fixes made in response have **not been re-run**. |
| 4 | Web terminal, council in the web chat/timeline | Built, typechecked and linted. **Not run.** Needs `TERMINAL_TICKET_SECRET` in both `.env` files. |
| — | pnpm workspace + Makefile | Installed; every package typechecks under pnpm. `make` is not installed on the dev machine yet. |
| 5 | VS Code extension, remote (non-local) mode, Monaco, web council notes composer | **Not started** |

---

## 7. Is this the most efficient design? Assessment and alternatives

### Where the cost goes

Every tool-using step re-sends the agent's growing conversation. So cost is dominated by the
**multi-step tool loops**, above all the Implementer's, not by the number of agents. A typical
small Task takes about **15–40 requests**:

| Turn | Requests |
|---|---|
| Planner exploring the code | 3–8 |
| Plan review | 1 |
| Implementer build | 5–15 |
| Review | 1 per round |
| Fix | 3–8 per round |

Reviews are cheap: one request, diff-sized input.

### Alternatives considered

| Option | Cost vs. today | Quality | Verdict |
|---|---|---|---|
| **Single agent + checks** (the `mastra` provider, plus `run_check`) | ~40–60% | No independent review; fine for trivial Tasks | Keep as the fast option |
| **Current council** (Planner + Implementer + Reviewer, loop driven in code) | baseline | Independent review by a *different* model family; checks outrank opinions | **Best balance on free tiers** |
| **Lean council**: Implementer plans as its first step, Reviewer reviews plan + code | ~70–80% | Loses the separate plan critique; keeps the code review | **Recommended next step** (see below) |
| LLM-routed agent network / supervisor (Mastra agent networks) | 120–200% | More autonomy, less predictable; the router itself costs calls | Rejected: a deterministic loop in code is cheaper and auditable |
| Best-of-N parallel implementers + judge | 200–400% | Higher on hard Tasks | Rejected for free tiers (per-minute limits) |
| Claude Code / Agent SDK headless | Paid; fewest wasted steps | Highest | Was provider `anthropic`; **removed** (ADR-3 D6) - Claude models stay available to AURA's own agents via the registry |

### Cheap improvements (not yet implemented)

1. **Lean mode** (`COUNCIL_MODE=lean`) folds the Planner into the Implementer's first turn. The
   biggest waste today is that the Planner and the Implementer both read the same files.
2. **Share file reads between agents.** Hand the Implementer the plan *and* the excerpts the
   Planner already read, so it doesn't fetch them again.
3. **Scale to the Task.** Skip the plan review when the plan touches ≤ 2 files; you can already
   set `COUNCIL_PLAN_ROUNDS=0` today.
4. **Prompt caching** once on Claude: cache each role's system prompt (see the note in `config/models.ts`).
5. **Trim tool output.** Cap `read_file` to the relevant line ranges (a `lines` argument), since
   whole-file reads are the largest input.

**Recommendation:** keep the current council as the default for real Tasks, and add lean mode
(1) plus shared reads (2) as the next efficiency step. Both are small, contained changes in
`workflows/coding-council.ts`.

---

## 8. Known gaps and risks

| Item | Notes |
|---|---|
| Server-side commits still author as `AURA <aura@localhost>` | `profiles.git_name/git_email` are stored but not used yet by `delegate_to_git`; the runtime would need the approving user's identity passed in with the approval. |
| Council notes are in memory | A runtime restart drops notes that haven't been read (the transcript keeps every note that was read). |
| Host checks run the project's own scripts | Accepted for local single-user use. Hosted use must set `SANDBOX_MODE=docker` and `TERMINAL_MODE=restricted`/`off`. |
| Council runs may exceed the API's 10-minute turn timeout | Raise `RUN_TURN_TIMEOUT_MS`. |
| Terminal tokens are not revoked when the session closes | They expire after 8h. Revoking on close would need a runtime→API call. |
| Free-tier quality | Keep Tasks small. The failing-check rule and Gate 5 keep a human last. |
