# SRS — 04. External Interfaces

## 1. Jira (Cloud / Data Center)

- **Inbound:** webhook receiver on issue transitions (`jira.issue.transitioned`) → internal event.
- **Outbound:** issue/story/task creation, comments, status transitions, provenance-stamped descriptions.
- **Constraint:** Jira remains the sole source of truth for work; AURA writes back but never forks its own competing work model.
- **Phase 1 (2026-09-17):** outbound writes go through the `mcp-atlassian` MCP server, called from delegate-tool code in `apps/agent-runtime` after a recorded human approval. No agent holds a Jira tool. Inbound webhooks are not yet wired; runs start from a human brief.
- **Open decision:** plain issues vs. Xray/Zephyr for test management (see [../ARCHITECTURE.md §15.3](../ARCHITECTURE.md#15-open-decisions-to-be-captured-as-adrs)).

## 2. Git hosting (GitHub / GitLab)

- Branch creation, commit, PR creation and update by Dev agents.
- Read access to repository contents and architecture docs for the Architect and Dev agents.
- All writes go through the Tool Gateway's `git` adapter; no agent holds direct host credentials.

## 3. CI/CD

- Triggers pipeline stages: lint, typecheck, unit, integration, Playwright/Robot Framework E2E, agent evals, image build, SBOM/vulnerability scan.
- Publishes machine-generated `test_results`, JUnit XML, traces, screenshots, and logs to object storage — never fabricated by an agent.

## 4. LLM providers

- Region-routed (EU/APAC/US endpoints) to satisfy data residency.
- Each agent version declares a primary and fallback provider/model (e.g. Anthropic Claude primary, OpenAI fallback).
- Provider calls are metered for token/cost accounting per run.

## 5. Supabase (per region)

- **Postgres + RLS:** system of record for identity, registry, projects, runs, approvals, artifacts, audit.
- **pgvector:** project-scoped embeddings for agent memory/RAG.
- **Object storage:** test artifacts, traces, screenshots, generated documents.
- **Auth:** SSO federation (SAML/OIDC) issuing JWTs with `org_id`, `roles[]`, `project_ids[]` claims.

## 6. Sandbox runner

- Isolated, ephemeral container execution for Dev-agent code and test runs.
- No network access except allow-listed package registries.
- Internal interface only (invoked by the Tool Gateway), not exposed externally.

## 7. Corporate identity provider

- SAML/OIDC federation into Supabase Auth per organization, at the global control-plane level (see [../ARCHITECTURE.md §9.3](../ARCHITECTURE.md#93-multi-region)).
