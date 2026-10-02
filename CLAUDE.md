# CLAUDE.md

Guidance for Claude Code in this repository.

## Project

AURA runs AI agents across the software delivery lifecycle. Agents draft the work, Jira holds the
work items, and a human approves every step through eight gates. Read
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing behaviour.

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Run all services | `make dev` |
| Tests | `make test` (or `pnpm --filter <app> test`) |
| Typecheck | `make typecheck` |
| Lint | `make lint` |
| Agent evals (uses model quota) | `pnpm --filter agent-runtime eval` |

Use **pnpm only** (one workspace, one lockfile). Package names: `web`, `api`, `agent-runtime`,
`aura-cli`, `@aura/client`.

## Layout

| Path | Contents |
|---|---|
| `apps/agent-runtime/src/mastra/` | `agents/` · `workflows/` · `tools/delegate-tools/` · `gateway/` · `contracts/` · `store/` · `workspace/` · `git/` · `terminal/` · `evals/` |
| `apps/api/src/modules/` | One folder per domain: `policy`, `approvals`, `audit`, `orchestration`, `projects`, … |
| `apps/api/supabase/migrations/` | SQL migrations `NNNN_name.sql` |
| `apps/web/src/features/` | One folder per screen |
| `apps/cli/src/commands/` | `aura` commands |
| `docs/` | Documentation (index: `docs/README.md`) |

## Rules

- **Agents propose, code decides.** Never move authorization, risk or approval logic into a prompt.
- **Permissions** live in `apps/api/src/modules/policy/policy.ts`. **Risk tiers** live in
  `agent-runtime/src/mastra/gateway/risk.ts`; every new tool mode needs a tier.
- **Agents** are registered in `agent-runtime/src/mastra/index.ts`; versions and models in
  `agents/registry.ts`. Bump the prompt version when a prompt changes, then re-record the eval
  baseline.
- **Mastra:** load the `mastra` skill before Mastra work (`apps/agent-runtime/AGENTS.md`).
- **Database:** add a new migration file; never edit an applied one. `audit_logs` is append-only.
- **Tests:** colocated `*.test.ts` (Vitest). Add tests for new deterministic code.
- **Environment:** never write or copy `.env` values. Add new variables to the app's
  `.env.example` with a comment and tell the user.
- **Model quota:** ask before running evals or live agent calls.

## Documentation

- Docs are Markdown in `docs/` with **mermaid** diagrams. Prefer tables and diagrams to long prose.
- Describe the system as it is now, in present tense. Put history in `docs/logs/`, not in other docs.
- Planned work goes in `docs/plans/aura-git-control-plane.md` (the roadmap), not in `ARCHITECTURE.md`.
- Do not edit existing daily logs in `docs/logs/`.

## Git

- Conventional commit subjects: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Do not add a `Co-Authored-By` trailer.
