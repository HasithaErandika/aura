# ADR-1. Source Dev-agent scaffolds from official live tooling, not checked-in templates

**Status:** Partially accepted and implemented (2026-09-21). Frontend and Backend/NestJS are both built and verified end-to-end (real Docker runs, exit 0, dependencies installed, files on disk, correct host-user ownership) — `agents/dev-agent.ts`, `tools/delegate-tools.ts`'s `delegate_to_dev` (Gate 4, `docs/ARCHITECTURE.md` section 6.4), sandboxed via Docker (`lib/docker-exec.ts`) per the sandbox decision below, now resolved for this local/solo-use pass. Backend/NestJS's earlier npm/arborist crash (`Cannot read properties of null (reading 'edgesOut')`) is fixed — see Consequences for root cause and fix. Backend/Spring Boot, Data, AI, and Integration remain proposed only, not implemented at all — see Consequences.

## Context

Gate 3 (`docs/ARCHITECTURE.md` section 6.3) now records a fixed technology stack on every architecture draft: frontend is always React 19 + Vite 19, database is always PostgreSQL, and the human picks the backend framework, Spring Boot or NestJS, before the Architect drafts. Every filed Architecture Task already carries a `discipline` (`Frontend`, `Backend`, `Data`, `AI`, `Integration`, or `Deployment` — `contracts/drafts.ts`).

The Dev agent that Phase 3 introduces needs to turn a filed Task into a running skeleton project: pick the right starting point for its discipline and stack, install it, and get it to a runnable state, before doing the actual feature work the Task describes. This ADR decides *where that starting code comes from* — the template/scaffold source — so that decision exists in one place before the Dev agent is built, rather than being improvised per-implementation later.

This ADR originally deliberately did not decide sandbox isolation for Dev-agent code execution (open decision #4 in `docs/ARCHITECTURE.md` section 15) — that is now resolved for this pass: **Docker, one container per run**, chosen as the practical, safest option for a local/solo development setup (real filesystem/process isolation from the host, without the operational overhead Firecracker/gVisor only earns at multi-tenant cloud scale). Revisit if AURA ever runs Dev agents against untrusted, multi-tenant work.

This ADR still does **not** decide how the Dev agent authenticates, branches, and opens a PR (`docs/ARCHITECTURE.md` section 14) — this pass is local scaffolding only, no git automation. That remains a prerequisite for anything beyond "files land on disk for a human to review and commit themselves."

## Decision

Scaffold from **official, live tooling**, invoked fresh each time, rather than templates checked into this repo or cloned from arbitrary external URLs. Concretely, per discipline:

- **Frontend** (React 19 + Vite 19, fixed): `npm create vite@latest <app-name> -- --template react-ts`, then `npm install`.
- **Backend — Spring Boot**: Spring Initializr's REST API (`https://start.spring.io/starter.zip?...`) with dependencies appropriate to the Task (`web`, `data-jpa`, `postgresql`, `validation` at minimum), fetched as a zip and extracted.
- **Backend — NestJS**: `npx @nestjs/cli new <app-name> --package-manager npm`.
- **Database — PostgreSQL**: no scaffolding CLI exists for this one; left as an open sub-decision below rather than picked here.

**Sequencing.** Because Frontend/Backend/Data Tasks scaffold independently — none of the commands above depends on another discipline's scaffold existing first — Dev agents can pick up and scaffold their respective Tasks in parallel once Architecture Tasks are filed. There is no hard ordering requiring frontend before backend before database; "frontend, then backend, then database" is a narration convenience, not a technical dependency.

**Status per discipline.** Frontend and Backend/NestJS both run reliably today, inside the Docker sandbox above, gated behind Gate 4 human approval (`docs/ARCHITECTURE.md` section 6.4). Backend/Spring Boot, Data, AI, and Integration are not implemented at all - `delegate_to_dev` fails clearly if asked for one of them rather than silently doing nothing. For anything not yet reliable, a human developer still reads the filed Architecture Task and runs the equivalent commands by hand, exactly as this ADR originally described before any of it was built.

**Backend/NestJS fix (2026-09-21).** The `edgesOut` crash root-caused to node:22-slim's bundled npm 10.9.8 arborist itself - reproduced with a plain `npm install` in a freshly scaffolded project, `npx` was never the cause. Fixed in `BACKEND_SCAFFOLDS.NestJS`'s command by pointing the global npm prefix at a writable path (the container runs as the host UID per `docker-exec.ts`, so a plain `npm install -g` fails `EACCES` against the root-owned default prefix) and upgrading npm there before scaffolding: `npm config set prefix /tmp/npm-global && export PATH=/tmp/npm-global/bin:$PATH && npm install -g npm@latest @nestjs/cli --silent && nest new . ...`. Verified with two independent real Docker runs, both exit 0, both with dependencies installed and correct host-user file ownership.

## Consequences

**Positive**
- Scaffolds are always current against upstream Vite/NestJS/Spring Boot releases — nothing in this repo goes stale.
- No template repository to create, review, or keep patched.
- Identical to what a human already does by hand from a filed Task, so adopting this later is a pure automation of existing practice, not a process change.

**Negative**
- Requires network egress from wherever the Dev agent eventually runs (npm registry, Spring Initializr) and the relevant tooling installed in that sandbox (Node for Vite/NestJS; nothing beyond HTTPS to call Spring Initializr, though the generated project itself needs a JDK to build).
- Spring Initializr is an external start.spring.io dependency; a self-hosted Initializr instance is the fallback if that external dependency ever becomes a hard requirement.
- Docker isolation is real but not as strong as a microVM; acceptable for a local/solo setup, not yet re-evaluated for multi-tenant or untrusted-input use.

## Open sub-decision: database provisioning

Two options, neither decided here:
1. Scaffold a local `docker run postgres:16` (or compose service) plus a migration tool (Flyway or Prisma) seeded from the architecture draft's `dataDesign` section.
2. Connect to an already-provisioned managed PostgreSQL instance (e.g. per-environment connection details supplied outside the Dev agent).

Whichever is chosen should follow the same principle as the CLIs above — official, live tooling — not a checked-in schema template.
