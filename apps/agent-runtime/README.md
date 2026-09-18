# AURA agent-runtime

Mastra runtime for the Phase 1/2 agents: the Orchestrator, the PO Agent, the BA Agent, and the Architect Agent (Gates 1-3). Reached only through `apps/api`; Mastra Studio at `http://localhost:4111` stays available to engineers.

## How a run works

1. A human briefs the **Orchestrator** (`agents/orchestrator.ts`). It decides what to do next; nothing in the API or web encodes a step order.
2. It calls `delegate_to_po`, `delegate_to_ba`, or `delegate_to_architect` (`tools/delegate-tools.ts`) in `draft` mode. For PO/BA the tool runs the sub-agent once with a **structured output schema** (`contracts/drafts.ts`); for the Architect it runs the **Architect Workflow** (`workflows/architect-workflow.ts`) - several narrow, sequenced LLM calls (requirements analysis → decomposition → API/data/security/AI design in parallel → deployment/testing notes → ADRs + tasks) instead of one big call, with per-step progress relayed live through the same tool call via Mastra's `writer.custom()` API. Either way the tool stores the resulting JSON in the **draft store** (`store/draft-store.ts`) and returns a `draftId` plus rendered Markdown.
3. The Orchestrator shows the Markdown once and pauses with `ask_user` (options Approve, Revise, Reject). The API turns that pause into a durable approval request.
4. Revise: the tool receives only the `draftId` and the feedback, produces a new version (as one holistic call, even for the Architect - a revision is a smaller, targeted change), and the loop repeats.
5. Approve: the tool's `file` mode reads the stored draft and creates the Jira Epic, Stories, or Tasks **in code** through the Jira MCP client, with the parent link, a provenance stamp, and idempotency on retry. The Architect's `file` also writes ADRs, a requirements summary, `architecture.md`, and `plan.md` to its per-Epic workspace (`workspace/architect-workspace.ts`, read-only browsable from the web app's Design Documents page via `server/workspace-routes.ts`). No model is involved in any step that must be exact.

Every sub-agent holds no tools. The Orchestrator holds no Jira tools and no filesystem tools. A model can propose; only code, after a recorded human approval, writes to Jira or the workspace.

## Token discipline

- A draft crosses a model boundary at most twice per version: once when the sub-agent produces it and once when the Orchestrator shows it to the human. Revise and file calls carry ids, not text.
- Sub-agents run a single step with no memory and no tool schemas in context.
- The Orchestrator keeps a bounded message window (`lastMessages`) and uses a small model for thread titles.

## Layout

```
src/mastra/
  index.ts               registers agents, workflows, tools, storage, observability, MCP proxies, custom routes
  agents/                orchestrator, po-agent, ba-agent, architect-agent, registry.ts (tool/model manifest)
  workflows/             architect-workflow.ts - the Architect's multi-step design workflow
  workspace/             architect-workspace.ts - per-Epic LocalFilesystem for design documents
  server/                workspace-routes.ts - read-only HTTP routes onto that workspace
  tools/                 delegate-tools (draft / revise / file per agent)
  contracts/drafts.ts    Zod schemas for Epic/Story/Architecture drafts, Markdown and Jira renderers
  store/draft-store.ts   libsql-backed draft store (AURA_DRAFTS_DB_URL)
  mcp/jira-client.ts     Jira MCP connection and the typed facade the tools call
  lib/generate-object.ts shared "ask an agent for one structured object, retry once" helper
```

## Setup

1. Copy `.env.example` to `.env`: `GROQ_API_KEY`, the Jira MCP transport, `JIRA_PROJECT_KEY`, and `AURA_WORKSPACE_ROOT` (an absolute path - see the file for why).
2. `npm install` (applies `patches/@mastra+schema-compat` for Groq tool calling).
3. `npm run dev` and open Studio at `http://localhost:4111`, or drive it from the AURA web app through `apps/api`.

The schema-compat patch needs a full process restart to take effect, not a hot reload.
