# AURA Documentation

```mermaid
flowchart TD
    START(["New to AURA?"]) --> STORY["story.md<br/>plain-English intro"]
    STORY --> ARCH["ARCHITECTURE.md<br/>how it is built"]
    ARCH --> SETUP["../SETUP.md<br/>install and run"]
    ARCH --> DEEP["Deeper reading"]
    DEEP --> SRS["SRS.md"]
    DEEP --> ADR["adr/"]
    DEEP --> SEC["security/"]
    DEEP --> PLANS["plans/"]
```

| Document | Contents |
|---|---|
| [story.md](story.md) | What AURA is, in simple words |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design as built |
| [../SETUP.md](../SETUP.md) | Install, configure, run, troubleshoot |
| [SRS.md](SRS.md) | Requirements with build status |
| [plans/aura-code-cli-council.md](plans/aura-code-cli-council.md) | `aura` CLI, Coding Council, web terminal |
| [plans/aura-git-control-plane.md](plans/aura-git-control-plane.md) | Roadmap |
| [plans/aura-automation-durability.md](plans/aura-automation-durability.md) | Settings, durable execution, RLS, budgets, automation (approved) |
| [plans/aura-vscode-agents.md](plans/aura-vscode-agents.md) | VS Code workspace, specialist agents, parallel Task branches (approved, current) |
| [plans/aura-runtime-refactor.md](plans/aura-runtime-refactor.md) | Agent runtime review against Mastra docs and refactors (deferred) |
| [clarify.md](clarify.md) | Open questions and their status |
| [adr/](adr/) | Architecture decision records |
| [security/threat-model.md](security/threat-model.md) | Threats and controls |
| [runbooks/rotate-shared-secrets.md](runbooks/rotate-shared-secrets.md) | Rotate a leaked secret |
| [logs/](logs/) | Daily engineering logs |

## Decision records

| ADR | Decision | Status |
|---|---|---|
| [ADR-1](adr/0001-dev-agent-scaffold-and-template-strategy.md) | Scaffold from official tools, not templates | Superseded by ADR-4 (scaffold runs locally) |
| [ADR-2](adr/0002-team-scale-deployment.md) | Team-scale deployment shape | Partly superseded by ADR-4 |
| [ADR-3](adr/0003-git-workflow.md) | One repo per project, Task branches, PRs | Accepted; D2 and D8 superseded by ADR-4 |
| [ADR-4](adr/0004-vscode-developer-workspace.md) | Developers in VS Code; cloud holds no code; no Docker | Accepted |
