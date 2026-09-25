# AURA

Governed AI agent orchestration platform for the software delivery lifecycle. AURA coordinates specialised AI agents (Project Owner, BA, Architect, Developer, QA, Tester, Deployer) across the SDLC, uses Jira as the system of record for work, enforces role- and project-based access control outside the LLM, and gates every consequential action behind human approval.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture baseline and [docs/srs/](docs/srs/) for the software requirements specification.

## Layout

```
apps/            web, api, agent-runtime, cli (the `aura` command)
packages/        aura-client (typed API client shared by the apps)
patches/         pnpm dependency patches
docs/            architecture, plans, srs, adr, security, runbooks, workflows, logs
```

A **pnpm workspace**: `apps/` holds the runnable apps (`web`, `api`, `agent-runtime`, and the `aura` CLI in `cli`), `packages/` holds code shared between them (`aura-client`, the typed API client). One `pnpm install` at the root, one `pnpm-lock.yaml`. See [SETUP.md](SETUP.md) for what each part is and how to run it.

## Getting started

```bash
pnpm install      # or: make install
make env          # create .env files from the examples, then fill them in
make dev          # agent-runtime + api + web together (or: pnpm dev)
make cli          # optional: put the `aura` developer CLI on your PATH
```

Full walkthrough: [SETUP.md](SETUP.md). `make help` lists every shortcut.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [SRS](docs/srs/00-overview.md)
- [Daily logs](docs/logs/)
