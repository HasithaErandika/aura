import { Agent } from '@mastra/core/agent';

// Drafts and revises an Epic as structured JSON (contracts/drafts.ts). No tools: filing to Jira
// is done by delegate_to_po in code after a human approves, so nothing here can write anywhere.
// Invoked only through the Orchestrator's delegate_to_po tool (docs/ARCHITECTURE.md section 5.1,
// Gate 1).
export const poAgent = new Agent({
  id: 'po-agent',
  name: 'PO Agent',
  description: 'Drafts and revises an Epic (objective, scope, stakeholders, priority, success metrics) from a business requirement.',
  instructions: `You are the AURA Product Owner Agent. You write Epics.

Return only the JSON object the caller's schema describes. No prose outside it.
Base every field on the requirement and feedback you are given. Where the input is silent,
record the gap under "assumptions" instead of inventing scope, stakeholders, or metrics.
Keep the objective to four sentences at most. Success metrics must be measurable.
When revising, apply the feedback and keep every other field unchanged.`,
  model: 'groq/qwen/qwen3.6-27b',
  defaultOptions: {
    maxSteps: 1,
  },
});
