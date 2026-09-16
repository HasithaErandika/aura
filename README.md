# AURA

Governed AI agent orchestration platform for the software delivery lifecycle. AURA coordinates specialised AI agents (Project Owner, BA, Architect, Developer, QA, Tester, Deployer) across the SDLC, uses Jira as the system of record for work, enforces role- and project-based access control outside the LLM, and gates every consequential action behind human approval.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture baseline and [docs/srs/](docs/srs/) for the software requirements specification.

## Layout

```
apps/            web, api, agent-runtime
docs/            architecture, srs, adr, security, runbooks, workflows, logs
```

Each app under `apps/` is a standalone project with its own `package.json`/lockfile and is run independently — there is no shared workspace tooling (pnpm workspaces/Turborepo) at the root. `packages/`, `tests/`, and `infra/` from the architecture baseline (see [docs/ARCHITECTURE.md §13](docs/ARCHITECTURE.md#13-monorepo-layout)) are deferred until there's real cross-app duplication to factor out; Mastra manages agent/workflow code inside `apps/agent-runtime` for now.

## Getting started

Each app is installed and run on its own:

```bash
cd apps/web && npm install && npm run dev
cd apps/api && npm install && npm run dev
cd apps/agent-runtime && npm install && npm run dev
```

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [SRS](docs/srs/00-overview.md)
- [Daily logs](docs/logs/)
