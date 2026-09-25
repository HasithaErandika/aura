# AURA — setup guide

How the repository is laid out, what each part does, and how to run everything locally.
For *why* things are built this way, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). For the
CLI / Coding Council work, see [docs/plans/aura-code-cli-council.md](docs/plans/aura-code-cli-council.md).

---

## 1. Repository layout

```
aura/
├── apps/                  runnable applications - each is its own workspace package
│   ├── web/               React + Vite UI (port 5173)
│   ├── api/               Express API: auth, policy, approvals, audit (port 4000)
│   ├── agent-runtime/     Mastra agents, workflows, Coding Council (port 4111)
│   └── cli/               the `aura` command-line tool
├── packages/              libraries shared by several apps - not run on their own
│   └── aura-client/       typed client for the AURA API (REST + live streams)
├── patches/               pnpm patches for dependencies (Groq fix for @mastra/schema-compat)
├── docs/                  architecture, requirements (srs/), plans/, adr/, daily logs/
├── package.json           workspace root - scripts only, no code
├── pnpm-workspace.yaml    workspace members, patches, overrides, allowed build scripts
├── pnpm-lock.yaml         the ONE lockfile for everything
├── Makefile               shortcuts - `make help`
├── README.md
└── SETUP.md               this file
```

The repo is a **pnpm workspace**. Every folder under `apps/` and `packages/` is its own package
with its own `package.json`, but there is a single install (`pnpm install` at the root) and a
single lockfile. The old per-app `package-lock.json` files and `npm install` flow are gone; use
pnpm (or `make`) only.

### `apps/` — the things you run

| App | What it is | Talks to | Port |
|---|---|---|---|
| **`apps/web`** | The browser UI: dashboard, Jira board, agent workspace (chat with the Orchestrator), approvals inbox, runs, audit log, design docs, dev/QA files, Profile (access tokens). | `apps/api` only (plus Supabase Auth for sign-in) | 5173 |
| **`apps/api`** | The governance layer. Checks who you are (Supabase session **or** a personal access token), what your role may do, turns every agent pause into a durable approval request, records the audit trail, and streams agent runs to clients. **Clients never call the agent runtime directly.** | Supabase (Postgres), `apps/agent-runtime`, Jira | 4000 |
| **`apps/agent-runtime`** | The Mastra server holding every AI agent: the Orchestrator plus the PO, BA, Architect, Dev, Coding, QA, Tester and Deployer agents and their workflows. It writes to Jira and the local workspace only after a human approves. It also hosts the Coding Council (Planner, Implementer and Reviewer agents). Mastra Studio is at `http://localhost:4111`. | LLM providers (Groq, Gemini), Jira (MCP), local disk, optional Docker | 4111 |
| **`apps/cli`** | The `aura` command, the developer's terminal interface: list Tasks, open a Task's worktree, start the Coding Council, approve gates, commit as yourself, push, and open PRs. | `apps/api` (via `packages/aura-client`), local `git` / `gh` | — |

### `packages/` — shared code

| Package | What it is | Used by |
|---|---|---|
| **`packages/aura-client`** (`@aura/client`) | A small, framework-free TypeScript client for the AURA API: typed methods (`me`, `jira`, `threads`, `approvals`, `council`, …) and a reader for the API's server-sent-event streams. It's written once so the CLI, the web app and the future VS Code extension don't each reimplement it. | `apps/cli` (`"@aura/client": "workspace:*"`) |

A package is used from its built `dist/`. `pnpm install` builds it automatically (its `prepare`
script); after changing its source, run `pnpm --filter @aura/client build`.

### How the pieces connect

```
 browser (apps/web) ─┐
 aura CLI (apps/cli) ┼──► apps/api ──► apps/agent-runtime ──► Groq / Gemini (LLMs)
                     │      │                 │            ──► Jira (MCP)
                     │      ▼                 ▼            ──► .workspaces/ on disk (git worktrees)
                     │   Supabase         mastra.db / aura-drafts.db (local libSQL files)
                     ├── Supabase Auth (web sign-in only)
                     └── web terminal: browser ⇄ ws://localhost:4112 (agent-runtime), ticket signed by apps/api
```

---

## 2. Prerequisites

| Need | Why | Notes |
|---|---|---|
| **Node.js ≥ 22.13** | every app | `node --version` |
| **pnpm 11** | installs and runs the workspace | `corepack enable` (uses the version pinned in `package.json`), or `npm i -g pnpm` |
| `make` *(optional)* | the Makefile shortcuts | `sudo apt install make`; every target is also a plain pnpm command |
| **python3** | the web terminal's full shell mode | preinstalled on Linux/macOS |
| **git** | Task worktrees, commits | `git config --global user.name/user.email` set |
| **A Supabase project** | identity, roles, runs, approvals, audit | free tier is fine |
| **Groq API key** | primary LLM for all agents | free: https://console.groq.com/keys |
| **Google AI Studio key** | fallback LLM, Coding Council Reviewer | free: https://aistudio.google.com |
| **Jira Cloud** + API token | the system of record for Epics/Stories/Tasks | https://id.atlassian.com/manage-profile/security/api-tokens |
| Docker *(optional)* | Dev scaffolds (Gate 4), Playwright tests (Gate 7), Claude Code/Codex providers, `SANDBOX_MODE=docker` | The Coding Council itself **does not need Docker** |
| `gh` *(optional)* | `aura push --pr` | https://cli.github.com |
| VS Code `code` command *(optional)* | `aura open --code` | VS Code → "Shell Command: Install 'code' command in PATH" |

---

## 3. One-time setup

### 3.1 Database (Supabase)

Run every migration in `apps/api/supabase/migrations/`, **in order**, in the Supabase SQL editor:

```
0001_identity.sql
0002_runs_approvals_audit.sql
0003_run_step_progress_kind.sql
0004_coding_agent_credentials.sql
0005_remove_tester_role.sql
0006_access_tokens_git_identity.sql   ← access tokens for the CLI + per-user git identity
```

### 3.2 Environment files

Each app has a `.env.example`. Copy it to `.env` and fill in the values; every variable is
described in the file itself.

```bash
make env        # copies each missing .env from its .env.example - never overwrites
# or by hand:
cp apps/agent-runtime/.env.example apps/agent-runtime/.env
cp apps/api/.env.example           apps/api/.env
cp apps/web/.env.example           apps/web/.env
```

| File | Key values |
|---|---|
| `apps/agent-runtime/.env` | `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, Jira MCP settings, `JIRA_PROJECT_KEY`, `AURA_WORKSPACE_ROOT` (use an **absolute** path), Coding Council settings (see §7) |
| `apps/api/.env` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WEB_ORIGIN`, `MASTRA_RUNTIME_URL`, Jira read credentials, `TERMINAL_TICKET_SECRET` (see §6) |
| `apps/web/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` |

Never commit `.env` files.

### 3.3 Install dependencies

```bash
pnpm install        # or: make install
```

One command for everything. It also applies `patches/` (the Groq tool-calling fix), builds
`packages/aura-client` and `apps/cli`, and runs the only allowed dependency build script
(esbuild). `make doctor` checks Node, pnpm, git, python3, Docker, gh and your `.env` files.

### 3.4 First admin user

```bash
pnpm --filter api bootstrap-admin -- --email you@company.com --name "Your Name" --password "..."
```

Then sign in to the web app as that admin and create the other users (Admin → Users) with their
roles: project_owner, business_analyst, architect, developer, qa_engineer or deployer.

---

## 4. Running locally

```bash
make dev            # agent-runtime + api + web together; Ctrl+C stops all three
# same as: pnpm dev
```

Or each in its own terminal (start the runtime first):

```bash
make runtime        # pnpm --filter agent-runtime dev   → http://localhost:4111 (Mastra Studio)
make api            # pnpm --filter api dev             → http://localhost:4000
make web            # pnpm --filter web dev             → http://localhost:5173
```

Check that it's up: `curl http://localhost:4000/health`, then sign in at http://localhost:5173.

### Useful commands

| `make` | pnpm | Does |
|---|---|---|
| `make typecheck` | `pnpm -r run typecheck` | TypeScript check of every app and package |
| `make lint` | `pnpm --filter web lint` | ESLint (web) |
| `make build` | `pnpm -r run build` | production build of everything |
| `make cli` | see §5 | build the CLI and put `aura` on your PATH |
| `make terminal-secret` | — | print a random `TERMINAL_TICKET_SECRET` |
| `make doctor` | — | check prerequisites and `.env` files |
| `make clean` | — | delete every `node_modules`, `dist`, `.mastra` |
| — | `pnpm --filter <app> add <pkg>` | add a dependency to one app (`api`, `web`, `agent-runtime`, `aura-cli`, `@aura/client`) |

## 5. The `aura` CLI

### Install

```bash
make cli            # builds @aura/client + the CLI, then `pnpm link --global` in apps/cli
aura --help
```

The first time, pnpm may ask you to run `pnpm setup` so its global bin directory is on your
PATH (then open a new shell). Without linking, run `node apps/cli/dist/index.js`. `make
cli-unlink` removes it again.

### Log in

1. In the web app: **Profile → Access tokens → Create token**. Copy it; it's shown only once.
2. In your terminal:
   ```bash
   aura login --api http://localhost:4000     # paste the token when asked
   ```
   This saves the API URL and token to `~/.config/aura/config.json` (file mode 0600). It also
   copies your `git config user.name/email` to your AURA profile, so commits AURA makes on your
   behalf are authored by you.

For CI or a one-off shell, `AURA_TOKEN=aura_pat_… AURA_API_URL=… aura whoami` works without logging in.
**In the web terminal you never need `aura login`:** it signs the CLI in as you automatically.

### Typical flow

```bash
aura tasks --epic KAN-36            # Tasks in an Epic, with status
aura code KAN-45 --epic KAN-36      # no worktree yet → drafts the Dev scaffold (Gate 4) first
aura code KAN-45                    # drafts the coding plan with the Coding Council → Gate 5
aura approve                        # runs the council; its discussion streams live
aura say "use zod for the form"     # (from another terminal) note for the next council round
aura open KAN-45 --code             # open the Task's worktree in VS Code
aura diff                           # what changed since the Task branched (inside the worktree)
aura commit                         # one commit authored by YOU, with AURA-Task/AURA-Run trailers
aura push --pr                      # push feature/KAN-45 with your own git credentials, open a PR
aura status                         # pending gates + today's free-tier model usage
```

When you run it inside a Task worktree, the Task key is inferred from the `feature/<TASK>`
branch, so `aura diff`, `aura commit` and so on need no arguments.

---

## 6. The web terminal (Project Files)

Developers get a VS Code-style terminal under the CodeMirror editor on **Project
Files** (the one workspace for an Epic's design docs, tests and code). It opens a shell in the loaded Task's worktree (or the base scaffold), with `aura`,
`git`, `npm` and everything else on your PATH, and `aura` already signed in as you.

Enable it once:

```bash
make terminal-secret          # prints a random secret
```

Put the **same** value in both files, then restart the runtime and the API:

```dotenv
# apps/agent-runtime/.env
TERMINAL_TICKET_SECRET=<the secret>
# apps/api/.env
TERMINAL_TICKET_SECRET=<the secret>
```

| Setting (agent-runtime) | Default | Meaning |
|---|---|---|
| `TERMINAL_HOST` / `TERMINAL_PORT` | `127.0.0.1` / `4112` | where the terminal WebSocket listens |
| `TERMINAL_MODE` | `full` on loopback, else `restricted` | `full` = a real shell; `restricted` = allowlisted commands only; `off` |
| `TERMINAL_ALLOWED_ORIGINS` | `http://localhost:5173` | web origins allowed to connect |

It's for the Developer role only; every session start is written to the audit log. Keep it on
loopback. A full shell is refused on any other address.

### Runners tab

Next to **Terminal** in the same panel, **Runners** shows what AURA is running right now,
refreshing every 5 seconds while it's open:
- Docker containers (scaffold, coding, test and CI), with live CPU, memory and processes
  against the per-container limit of 2 CPUs, 2 GB and 512 processes
- host CPU load and memory
- Coding Council runs in progress, with their round, phase and token budget
- project checks running on the host
- open terminal sessions

Switch between the loaded Epic and **All**. Developers, Architects, QA and admins see it.

## 7. Coding Council settings

**Models** are set in code, in the agent registry, next to every other agent's model
(`apps/agent-runtime/src/mastra/agents/registry.ts`). Each role has an ordered fallback chain,
free tier by default:

| Role | Constant | Chain (first → fallback) |
|---|---|---|
| Planner | `COUNCIL_PLANNER_MODEL_IDS` | `groq/openai/gpt-oss-120b` → `google/gemini-3.5-flash-lite` |
| Implementer | `COUNCIL_IMPLEMENTER_MODEL_IDS` | `groq/openai/gpt-oss-120b` → `google/gemini-3.5-flash-lite` |
| Reviewer | `COUNCIL_REVIEWER_MODEL_IDS` | `google/gemini-3.5-flash-lite` → `groq/qwen/qwen3.8-27b` |

**Loop limits** are set in `apps/agent-runtime/.env`. All are optional; the defaults are shown:

```dotenv
COUNCIL_PLAN_ROUNDS=1
COUNCIL_MAX_ROUNDS=2
COUNCIL_IMPLEMENTER_STEPS=15
COUNCIL_FIX_STEPS=8
COUNCIL_TOKEN_BUDGET=150000
SANDBOX_MODE=host        # host = run checks directly (no Docker); docker = run them in a container
```

**Moving to Claude later:** set `ANTHROPIC_API_KEY` in `apps/agent-runtime/.env` and put
`'anthropic/claude-sonnet-5'` first in each of the three `COUNCIL_*_MODEL_IDS` lists in
`registry.ts` (keep the free models after it as fallbacks). Nothing else changes.

A council run can take longer than the API's default 10-minute turn limit, so raise
`RUN_TURN_TIMEOUT_MS` in `apps/api/.env` (for example to `1800000`, 30 minutes) if runs get cut off.

---

## 8. Where things are stored

| Path | What |
|---|---|
| `$AURA_WORKSPACE_ROOT/<EPIC>/architecture/` | Architect design docs (Gate 3) |
| `$AURA_WORKSPACE_ROOT/<EPIC>/dev/<discipline>/` | the scaffolded base repo per discipline (Gate 4) |
| `…/dev/<discipline>/.worktrees/<TASK>/` | **each Task's own git worktree** on branch `feature/<TASK>` — what `aura open` opens |
| `…/.worktrees/<TASK>/.aura/council/` | Coding Council transcripts (kept out of git) |
| `$AURA_WORKSPACE_ROOT/<EPIC>/qa/` | QA test plan + Playwright specs (Gate 6) |
| `apps/agent-runtime/mastra.db`, `aura-drafts.db` | agent memory, drafts, model usage (local libSQL) |
| Supabase | users/roles, runs, approvals, audit log, access tokens |
| `~/.config/aura/config.json` | CLI login and per-Task conversation ids |

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `aura`: *Invalid, expired, or revoked access token* | Create a new token on the Profile page and `aura login` again |
| `aura`: *AURA API is unreachable* | Is `apps/api` running? Check the `--api` URL in `aura whoami` |
| `aura code`: *has no worktree yet* | Pass `--epic <KEY>`; AURA drafts the Dev scaffold (Gate 4) first |
| API: *Agent runtime is unreachable* | Start `apps/agent-runtime`; check `MASTRA_RUNTIME_URL` |
| Council stops with *token budget reached* / waits on rate limits | Free-tier quota: check `aura status`, wait, or raise `COUNCIL_TOKEN_BUDGET` |
| Council run cut off after 10 minutes | Raise `RUN_TURN_TIMEOUT_MS` in `apps/api/.env` |
| CLI can't find `@aura/client` | `pnpm install` at the repo root (it builds the package) |
| `pnpm install` says a patch was not applied | `@mastra/schema-compat` must stay at 1.3.10 (pinned in `pnpm-workspace.yaml`) - update the patch before bumping it |
| `pnpm link --global` fails | Run `pnpm setup`, open a new shell, retry `make cli` |
| Web terminal: *not enabled* / disconnects immediately | Same `TERMINAL_TICKET_SECRET` (32+ chars) in both `.env` files; restart runtime and API; check the runtime log for `[aura-terminal]` |
| Web terminal: *ticket rejected* | The two secrets differ, or the machine clocks differ |
| Groq calls fail with `Invalid API Key` / `expired_api_key` | Renew `GROQ_API_KEY` in `apps/agent-runtime/.env`; until then only the Gemini fallback works |
| `make: command not found` | `sudo apt install make`, or use the pnpm command shown in §4 |
