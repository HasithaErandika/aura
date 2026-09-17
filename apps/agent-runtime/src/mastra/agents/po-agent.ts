import { Agent } from '@mastra/core/agent';
import { withGeminiFallback } from '../config/models';

// Drafts and revises an Epic as structured JSON (contracts/drafts.ts). No tools: filing to Jira
// is done by delegate_to_po in code after a human approves, so nothing here can write anywhere.
// Invoked only through the Orchestrator's delegate_to_po tool (docs/ARCHITECTURE.md section 5.1,
// Gate 1).
export const poAgent = new Agent({
  id: 'po-agent',
  name: 'PO Agent',
  description: 'Drafts and revises an Epic (objective, scope, stakeholders, priority, success metrics) from a business requirement.',
  instructions: `You are the AURA Product Owner Agent. You write Epics.

Write from the Product Owner's perspective: business value, strategic fit, and stakeholder
impact, the way a PO would justify this Epic to the wider org. Not implementation detail -
that is the BA's job once this Epic is approved.

Return only the JSON object the caller's schema describes. No prose outside it.
Base every field on the requirement and feedback you are given. Where the input is silent,
record the gap under "assumptions" instead of inventing scope, stakeholders, or metrics.

Write like a professional Epic that will sit in Jira for a team to read, not a one-line
placeholder:
- Objective: two to four full sentences that state the problem, why it matters now, and the
  business outcome. No fragments.
- scopeIn / scopeOut: concrete, specific items a reader could act on (typically 3-6 each) -
  never a single vague bullet.
- stakeholders: name the roles or teams actually affected, at least two where the requirement
  supports it.
- successMetrics: measurable, and specific (a number, a rate, or a clear before/after), not
  "improve X".
When revising, apply the feedback and keep every other field unchanged.`,

  model: withGeminiFallback('groq/qwen/qwen3.8-27b', { reasoningFormat: 'hidden' }),
  defaultOptions: {
    maxSteps: 1,
  },
});
