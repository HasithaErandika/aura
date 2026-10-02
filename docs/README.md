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
| [plans/aura-git-control-plane.md](plans/aura-git-control-plane.md) | **Roadmap**: the Task workflow, the company-harness plan, later phases |
| [plans/aura-automation-durability.md](plans/aura-automation-durability.md) | Parts A–C completed; D–G (RLS, budgets, triggers, auto-approval) planned |
| [plans/aura-vscode-agents.md](plans/aura-vscode-agents.md) | Completed (V0–V6); as built in ARCHITECTURE |
| [plans/aura-runtime-refactor.md](plans/aura-runtime-refactor.md) | Completed; R3 and R5 moved to the roadmap |
| [plans/aura-code-cli-council.md](plans/aura-code-cli-council.md) | Completed and superseded by ADR-4 |
| [clarify.md](clarify.md) | Open questions and their status |
| [adr/](adr/) | Architecture decision records |
| [security/threat-model.md](security/threat-model.md) | Threats and controls |
| [runbooks/rotate-shared-secrets.md](runbooks/rotate-shared-secrets.md) | Rotate a leaked secret |
| [logs/](logs/) | Daily engineering logs |

## Decision records

| ADR | Decision | Status |
|---|---|---|
| [ADR-1](adr/0001-dev-agent-scaffold-and-template-strategy.md) | Scaffold from official tools, not templates | Superseded by ADR-4 (scaffold runs on the developer's machine) |
| [ADR-2](adr/0002-team-scale-deployment.md) | Team-scale deployment shape | Partly superseded by ADR-4 |
| [ADR-3](adr/0003-git-workflow.md) | One repo per project, Task branches, PRs | Accepted; D2 and D8 superseded by ADR-4; D3–D5, D7 in the roadmap |
| [ADR-4](adr/0004-vscode-developer-workspace.md) | Developers in VS Code; cloud holds no code; no Docker | Accepted; built (V0–V7) |
