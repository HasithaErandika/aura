# ADR-1. Source Dev-agent scaffolds from official live tooling, not checked-in templates

**Status:** Proposed. Documents the target design for the Phase 3 Dev agent (`docs/ARCHITECTURE.md` section 14); no scaffolding or code execution is implemented yet — see Consequences.

## Context

Gate 3 (`docs/ARCHITECTURE.md` section 6.3) now records a fixed technology stack on every architecture draft: frontend is always React 19 + Vite 19, database is always PostgreSQL, and the human picks the backend framework, Spring Boot or NestJS, before the Architect drafts. Every filed Architecture Task already carries a `discipline` (`Frontend`, `Backend`, `Data`, `AI`, `Integration`, or `Deployment` — `contracts/drafts.ts`).

The Dev agent that Phase 3 introduces needs to turn a filed Task into a running skeleton project: pick the right starting point for its discipline and stack, install it, and get it to a runnable state, before doing the actual feature work the Task describes. This ADR decides *where that starting code comes from* — the template/scaffold source — so that decision exists in one place before the Dev agent is built, rather than being improvised per-implementation later.

This ADR deliberately does **not** decide:
- Sandbox isolation for Dev-agent code execution (Docker-in-CI vs Firecracker/gVisor) — open decision #4 in `docs/ARCHITECTURE.md` section 15, still unresolved.
- How the Dev agent authenticates, branches, and opens a PR (section 14).

Both remain prerequisites for actually running any of the commands below inside AURA; until they're resolved, this ADR is a plan a human can follow by hand from the filed Task, not a running capability.

## Decision

Scaffold from **official, live tooling**, invoked fresh each time, rather than templates checked into this repo or cloned from arbitrary external URLs. Concretely, per discipline:

- **Frontend** (React 19 + Vite 19, fixed): `npm create vite@latest <app-name> -- --template react-ts`, then `npm install`.
- **Backend — Spring Boot**: Spring Initializr's REST API (`https://start.spring.io/starter.zip?...`) with dependencies appropriate to the Task (`web`, `data-jpa`, `postgresql`, `validation` at minimum), fetched as a zip and extracted.
- **Backend — NestJS**: `npx @nestjs/cli new <app-name> --package-manager npm`.
- **Database — PostgreSQL**: no scaffolding CLI exists for this one; left as an open sub-decision below rather than picked here.

**Sequencing.** Because Frontend/Backend/Data Tasks scaffold independently — none of the commands above depends on another discipline's scaffold existing first — Dev agents can pick up and scaffold their respective Tasks in parallel once Architecture Tasks are filed. There is no hard ordering requiring frontend before backend before database; "frontend, then backend, then database" is a narration convenience, not a technical dependency.

**Not implemented today.** No agent runs these commands yet. Today, a human developer reads the filed Architecture Task (which already states its discipline, description, and acceptance criteria) and runs the same commands by hand. This ADR fixes what those commands will be once the Dev agent exists; it changes nothing about the current manual workflow.

## Consequences

**Positive**
- Scaffolds are always current against upstream Vite/NestJS/Spring Boot releases — nothing in this repo goes stale.
- No template repository to create, review, or keep patched.
- Identical to what a human already does by hand from a filed Task, so adopting this later is a pure automation of existing practice, not a process change.

**Negative**
- Requires network egress from wherever the Dev agent eventually runs (npm registry, Spring Initializr) and the relevant tooling installed in that sandbox (Node for Vite/NestJS; nothing beyond HTTPS to call Spring Initializr, though the generated project itself needs a JDK to build).
- Spring Initializr is an external start.spring.io dependency; a self-hosted Initializr instance is the fallback if that external dependency ever becomes a hard requirement.
- Still depends on the sandbox decision (#4) before any of this can execute safely — this ADR alone does not unblock building the Dev agent.

## Open sub-decision: database provisioning

Two options, neither decided here:
1. Scaffold a local `docker run postgres:16` (or compose service) plus a migration tool (Flyway or Prisma) seeded from the architecture draft's `dataDesign` section.
2. Connect to an already-provisioned managed PostgreSQL instance (e.g. per-environment connection details supplied outside the Dev agent).

Whichever is chosen should follow the same principle as the CLIs above — official, live tooling — not a checked-in schema template.
