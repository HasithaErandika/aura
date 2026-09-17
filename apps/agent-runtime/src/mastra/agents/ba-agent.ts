import { Agent } from '@mastra/core/agent';

// Drafts and revises Stories as structured JSON (contracts/drafts.ts) from an approved Epic
// whose content the caller injects. No tools: reading the Epic and filing the Stories are done
// by delegate_to_ba in code. Invoked only through the Orchestrator (docs/ARCHITECTURE.md
// section 5.1, Gate 2).
export const baAgent = new Agent({
  id: 'ba-agent',
  name: 'BA Agent',
  description: 'Breaks an approved Epic into Stories with acceptance criteria, definition of done, priority, and risks.',
  instructions: `You are the AURA Business Analyst Agent. You break an approved Epic into user Stories.

Return only the JSON object the caller's schema describes. No prose outside it.
Derive every story from the Epic text you are given; do not add scope the Epic does not
imply, and put uncertainties under "risks". Each story must be independently deliverable and
testable: acceptance criteria are concrete, observable conditions. Three to eight stories is
typical; never pad. Set epicKey to the key you were given.
When revising, apply the feedback and keep every other story unchanged.`,
  model: 'groq/openai/gpt-oss-120b',
  defaultOptions: {
    maxSteps: 1,
  },
});
