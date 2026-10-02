# Developer Tools: Coding Council and Web Terminal

| | |
|---|---|
| **Status** | Built; **being replaced** by the VS Code extension and specialist agents ([ADR-4](../adr/0004-vscode-developer-workspace.md)). The `aura` CLI was removed on 2026-10-02 |
| **Related** | [ARCHITECTURE.md](../ARCHITECTURE.md) · [SETUP.md](../../SETUP.md) |

These tools let a developer work on a Jira Task, while every action still goes through `apps/api`
(auth, policy, approvals, audit).

---

## 1. Overview

```mermaid
flowchart LR
    subgraph CLIENTS["Clients"]
        WEB["Project Files<br/>CodeMirror + xterm.js"]
    end
    WEB -->|"REST + SSE"| API["apps/api"]
    WEB -.->|"WebSocket + ticket"| TERM["Terminal server :4112"]
    API --> ORCH["Orchestrator"]
    ORCH --> COUNCIL["Coding Council"]
    COUNCIL --> WT[("Task worktree<br/>feature/TASK")]
    TERM --> WT
```

---

## 2. Coding Council

```mermaid
sequenceDiagram
    participant P as Planner
    participant R as Reviewer
    participant I as Implementer
    participant C as Checks
    P->>R: Markdown plan
    R-->>P: Plan verdict (JSON)
    P->>I: Final plan
    loop Up to COUNCIL_MAX_ROUNDS
        I->>C: Write code, run typecheck · build · test · lint
        C-->>R: Diff + check output
        R-->>I: APPROVE or CHANGES (failing check = CHANGES)
    end
```

| Role | Tools | Models (first → fallback) |
|---|---|---|
| Planner | `list_files`, `read_file`, `search_files` | `groq/openai/gpt-oss-120b` → `google/gemini-3.5-flash-lite` |
| Implementer | Read tools + `write_file`, `edit_file`, `run_check` | `groq/openai/gpt-oss-120b` → `google/gemini-3.5-flash-lite` |
| Reviewer | None (JSON verdict) | `google/gemini-3.5-flash-lite` → `groq/qwen/qwen3.8-27b` |

| Behaviour | Detail |
|---|---|
| Modes | `lean` (Implementer plans), `full`, `auto` (full for sensitive or large Tasks). Chosen at draft time and shown at Gate 5 |
| Checks | Fixed check ids from the project's `package.json`; no shell. Run on host or in Docker (`SANDBOX_MODE`) |
| Commits | One checkpoint commit per round on the Task branch |
| Retries | Fallback chain per role; on provider errors wait and retry (max 2) |
| Budget | `COUNCIL_TOKEN_BUDGET` stops the run cleanly and keeps the work |
| Streaming | Each turn streams as SSE event `council` and is saved as a run step |
| Transcript | `<worktree>/.aura/council/<draftId>.md` (excluded from git) |
| Outcome | Task moves to *In Review* only if the Reviewer approves |

### Files

| Piece | File (`apps/agent-runtime/src/mastra/`) |
|---|---|
| Loop | `workflows/coding-council.ts` |
| Agents | `agents/council-agents.ts` |
| Tools | `tools/council-tools.ts` |
| Checks | `lib/sandbox.ts` |
| Verdict schema, mode choice | `contracts/council.ts` |
| Models | `agents/registry.ts` |
| Notes and usage | `store/council-notes.ts`, `store/usage-store.ts` |

### Cost

A small Task takes about 15–40 model requests. Most go to the Implementer's tool loop.

| Option | Relative cost | Use |
|---|---|---|
| Single agent (`mastra`) | ~50% | Trivial Tasks |
| Lean council | ~75% | Default for normal Tasks |
| Full council | 100% | Sensitive or large Tasks |

---

## 3. Web terminal

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as apps/api
    participant T as Terminal server
    B->>A: POST /terminal/tickets
    A-->>B: 60s single-use ticket
    B->>T: WebSocket ?ticket=
    T->>T: Verify ticket, open shell in worktree
```

| Setting | Behaviour |
|---|---|
| Access | Developer role only; each session start is audited |
| `full` mode | Real shell (Python `pty` bridge); loopback only |
| `restricted` mode | Allowlisted commands: `aura`, `git`, `npm test/run`, `ls`, `cat`, `pwd` |
| Environment | Allowlist; no LLM keys, Jira token or secrets |
| Limits | 3 sessions per user; closes after 30 minutes idle |

---

## 4. Known limits

| Limit | Impact |
|---|---|
| Council notes are kept in memory | A runtime restart drops unread notes |
| Host checks run project scripts | Local use only; server mode requires Docker |
| Council runs can pass 10 minutes | Raise `RUN_TURN_TIMEOUT_MS` |
| Terminal tokens are not revoked on close | They expire after 8 hours |
| Free-tier models | Keep Tasks small |

## 5. Not built

VS Code extension · remote (non-local) worktrees · Monaco editor · council notes box in the web UI.
