# SRS — 00. Overview

> **Status:** Draft v0.2, reconciled with the Phase 1 implementation
> **Last updated:** 2026-09-17
> **Source:** derived from [../ARCHITECTURE.md](../ARCHITECTURE.md)

## 1. Purpose

This Software Requirements Specification (SRS) defines the functional and non-functional requirements for **AURA**, an enterprise AI agent orchestration and software-delivery platform. It is the requirements-level companion to the architecture baseline: the architecture document describes *how* the system is built; this SRS describes *what* the system must do and the constraints it must satisfy.

## 2. Scope

AURA coordinates specialised AI agents (Project Owner, Business Analyst, Architect, Developer, QA, Tester, Deployer) across the software development lifecycle. It:

- Uses **Jira as the single system of record** for work items and status.
- Enforces **role- and project-based access control** outside the LLM via a deterministic policy engine.
- Gates every consequential agent action behind **human approval**.
- Maintains **complete provenance** from business requirement to production deployment.

Out of scope for v1: replacing Jira as a project-management tool, autonomous production changes without human approval, and non-TypeScript service implementations (Go is reserved for a possible future sandbox runner only).

## 3. Definitions

See [../ARCHITECTURE.md §16 Glossary](../ARCHITECTURE.md#16-glossary) for the authoritative glossary (Gate, Grant, Run, Provenance stamp, Risk tier, Four-eyes, Loop guard).

## 4. Guiding principles

The five non-negotiable principles from the architecture baseline drive every requirement in this SRS:

1. Agents propose; deterministic systems decide.
2. Jira is the work state machine.
3. Human-in-the-loop is a workflow primitive, not a UI feature.
4. Every tool call is authorized, validated, bounded, and logged.
5. Evidence over assertion.

## 5. Document map

| Document | Contents |
|---|---|
| [01-overall-description.md](01-overall-description.md) | Product perspective, user classes/roles, operating environment, assumptions and constraints |
| [02-functional-requirements.md](02-functional-requirements.md) | Numbered functional requirements (FR-xxx) by capability area |
| [03-non-functional-requirements.md](03-non-functional-requirements.md) | Performance, security, reliability, scalability, compliance, observability requirements |
| [04-external-interfaces.md](04-external-interfaces.md) | Interfaces to Jira, Git, CI/CD, LLM providers, Supabase, SSO |
| [05-data-requirements.md](05-data-requirements.md) | Core data domains, retention, RLS, multi-region data residency |
| [06-use-cases.md](06-use-cases.md) | Actor-level use cases mapped to the seven human approval gates |

## 6. References

- [ARCHITECTURE.md](../ARCHITECTURE.md) — full architecture baseline (diagrams, schemas, sequence flows)
- [logs/](../logs/) — daily engineering log
