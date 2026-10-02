# Plan: Agent Runtime Review and Refactor

| | |
|---|---|
| **Status** | **Completed** 2026-10-02. R1, R2 and F6 done; R4 superseded; R3 and R5 moved to the [Roadmap](aura-git-control-plane.md) |
| **Checked against** | Mastra `@mastra/core` 1.67.0 embedded docs (`node_modules/@mastra/core/dist/docs/`) |
| **As built** | [ARCHITECTURE.md](../ARCHITECTURE.md) |

## Findings and outcome

| # | Finding | Outcome |
|---|---|---|
| F1 | The runtime re-published all Jira MCP tools (`mcpServers: jiraMcp.toMCPServerProxies()`), a Jira write path outside the tool gateway | ✅ **R1:** removed from `index.ts`; the MCP client used by delegate tools stays |
| F2 | Gates use `ask_user`, then the model calls the tool again with `approved=true` | ➡️ **R5** (native `requireApproval` spike) in the Roadmap |
| F3 | The Coding Council is a hand-written loop, not a workflow | ⚪ **R4 superseded:** the Council is removed in V7; the VS Code coder ↔ Evaluator loop replaces it |
| F4 | Old tool calls stay in the Orchestrator's model input | ✅ **R2:** `ToolCallFilter({ preserveModelOutput: true })`; old calls reach the model as compact results, draft ids included (Orchestrator agentVersion 1.2.0) |
| F5 | Explicit actions (buttons, extension commands) still go through an LLM | ➡️ **R3** (direct gate actions) in the Roadmap |
| F6 | A comment said the Orchestrator has "~800-line instructions" | ✅ Fixed |

## Code quality pass

| Change | Detail |
|---|---|
| Duplicates merged | One API URL and runtime-token helper (`lib/aura-api.ts`); one `bullets()` (`contracts/markdown.ts`); one `safeResolve`, `epicKeyParam`, `shellSafe`, `REVIEWER` and `answeringModel` |
| Dead code | `slugify` and the `workspaceRoot` alias removed |
| Bugs | `git merge-tree --write-tree` no longer passes `--quiet` (fails on git 2.43); API tests get placeholder environment values |
| Comments | One line under 20 words per function; references to the removed CLI and old plans removed |

## Mastra features considered and not adopted

| Feature | Why not (now) |
|---|---|
| Durable / evented agents | Beta; cross-process needs Redis PubSub; AURA's API must stay the only caller |
| Schedules and signal providers | They start runs inside the runtime, skipping the API's policy, budgets and audit. Triggers stay in the API |
| `PromptInjectionDetector` processor | Model-based, costs tokens per call. AURA's rule-based scanner (`gateway/untrusted.ts`) is free and wired to the approval card |
| `PostgresStore` | **Adopted** (automation plan Part B) |
