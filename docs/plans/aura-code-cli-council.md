# Plan: `aura` CLI, Coding Council and Web Terminal

| | |
|---|---|
| **Status** | **Completed and superseded.** Built, then replaced by the VS Code workspace ([ADR-4](../adr/0004-vscode-developer-workspace.md)) |
| **Where it went** | The CLI is removed. The Coding Council and web terminal are the legacy web lane in [ARCHITECTURE.md](../ARCHITECTURE.md) §4.3, removed in V7 of the [Roadmap](aura-git-control-plane.md) |

| Part | Today |
|---|---|
| `aura` CLI (`apps/cli`) | Removed. Developers use the AURA VS Code extension |
| Coding Council (Planner, Implementer, Reviewer) | Legacy web Gate 5 (`delegate_to_code`, provider `council`). Its replacement is the coder ↔ Evaluator loop in VS Code (ARCHITECTURE §4.1) |
| Single coding agent | Legacy web Gate 5 (provider `mastra`) |
| Web terminal and Runners | Server-side; no web page links to them since V3. Removed in V7 |
