# AURA agent-runtime

Mastra runtime for the Phase 1 agents: the Orchestrator, the PO Agent, and the BA Agent. Reached only through `apps/api`; Mastra Studio at `http://localhost:4111` stays available to engineers.

## How a run works

1. A human briefs the **Orchestrator** (`agents/orchestrator.ts`). It decides what to do next; nothing in the API or web encodes a step order.
2. It calls `delegate_to_po` or `delegate_to_ba` (`tools/delegate-tools.ts`) in `draft` mode. The tool runs the sub-agent once with a **structured output schema** (`contracts/drafts.ts`), stores the JSON in the **draft store** (`store/draft-store.ts`), and returns a `draftId` plus rendered Markdown.
3. The Orchestrator shows the Markdown once and pauses with `ask_user` (options Approve, Revise, Reject). The API turns that pause into a durable approval request.
4. Revise: the tool receives only the `draftId` and the feedback, produces a new version, and the loop repeats.
5. Approve: the tool's `file` mode reads the stored draft and creates the Jira Epic or Stories **in code** through the Jira MCP client, with the parent link, a provenance stamp, and idempotency on retry. No model is involved in the step that must be exact.

The PO and BA agents hold no tools. The Orchestrator holds no Jira tools. A model can propose; only code, after a recorded human approval, writes to Jira.

## Token discipline

- A draft crosses a model boundary at most twice per version: once when the sub-agent produces it and once when the Orchestrator shows it to the human. Revise and file calls carry ids, not text.
- Sub-agents run a single step with no memory and no tool schemas in context.
- The Orchestrator keeps a bounded message window (`lastMessages`) and uses a small model for thread titles.

## Layout

```
src/mastra/
  index.ts             registers agents, tools, storage, observability, MCP proxies
  agents/              orchestrator, po-agent, ba-agent
  tools/               delegate-tools (draft / revise / file), schedule-tools
  contracts/drafts.ts  Zod schemas for Epic and Story drafts, Markdown and Jira renderers
  store/draft-store.ts libsql-backed draft store (AURA_DRAFTS_DB_URL)
  mcp/jira-client.ts   Jira MCP connection and the typed facade the tools call
```

## Setup

1. Copy `.env.example` to `.env`: `GROQ_API_KEY`, the Jira MCP transport, and `JIRA_PROJECT_KEY`.
2. `npm install` (applies `patches/@mastra+schema-compat` for Groq tool calling).
3. `npm run dev` and open Studio at `http://localhost:4111`, or drive it from the AURA web app through `apps/api`.

The schema-compat patch needs a full process restart to take effect, not a hot reload.
