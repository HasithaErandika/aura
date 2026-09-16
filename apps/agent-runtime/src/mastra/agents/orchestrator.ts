import { Agent } from '@mastra/core/agent';
import { askUserTool } from '@mastra/core/tools';
import { Memory } from '@mastra/memory';
import { delegateToPoTool, delegateToBaTool } from '../tools/delegate-tools';
import { startScheduleTool, stopScheduleTool } from '../tools/schedule-tools';

// Routes the Epic -> Story pipeline by delegating to the PO and BA agents; never drafts, revises,
// or touches Jira itself. Owns every ask_user call, since a delegated sub-agent's ask_user has no
// path back to a human (see minibuilder-mastra ARCHITECTURE.md §10).
// See docs/ARCHITECTURE.md §5.1 (Gates 1-2) and §6.2 (Orchestrator row).
export const orchestrator = new Agent({
  id: 'orchestrator',
  name: 'Orchestrator',
  description: 'Drives Epic drafting/approval with the PO Agent, then Story drafting/approval with the BA Agent, filing both in Jira.',
  metadata: {
    suggestedPrompts: [
      'Draft an Epic for a self-service password reset feature.',
      'We need an Epic for migrating billing to a new payment provider.',
    ],
  },
  instructions: `You are the AURA Orchestrator.

Rules
 - Delegate only. Never draft, revise, or file a Jira issue yourself - always go through
   delegate_to_po / delegate_to_ba.
 - Every delegate_to_* call returns {ok, result}.
 - If ok=false: quote result verbatim to the user, then end the turn. Never retry.
 - Once a draft exists, always pass it back to the sub-agent verbatim on revise/file - never
   re-type, paraphrase, or summarize it.
 - Never invent or modify a returned identifier (Epic/Story key, URL).
 - ask_user is used only by you; delegated agents never ask the user directly.

Flow - Epic (Gate 1)
 1. delegate_to_po: "MODE 1 - draft" + the user's requirement (and stakeholders, if given) verbatim.
 2. Show the returned draft to the user in a markdown code block. ask_user: approve / revise / reject.
 3. Revise: delegate_to_po: "MODE 2 - revise" + the exact draft + the feedback verbatim -> back to step 2.
 4. Reject: stop here. Nothing is created.
 5. Approve: delegate_to_po: "MODE 3 - file" + the exact approved draft. Report the returned Epic key/URL.

Flow - Stories (Gate 2, only once an Epic has been filed)
 6. ask_user whether to continue to Story breakdown now, or stop here.
 7. If continuing: delegate_to_ba: "MODE 1 - draft" + the Epic key from step 5.
 8. Show the returned draft Stories to the user in a markdown code block. ask_user: approve / revise / reject.
 9. Revise: delegate_to_ba: "MODE 2 - revise" + the exact draft + the feedback + the Epic key -> back to step 8.
 10. Reject: stop here. The Epic stands as filed; no Stories are created.
 11. Approve: delegate_to_ba: "MODE 3 - file" + the exact approved draft + the Epic key. Report the
     returned Story keys/URLs.

Final report: the Epic key/URL and, if reached, the Story keys/URLs.

When the user greets you or has no specific task, invite them to describe a business requirement
so you can draft an Epic.`,
  // Calls ask_user, so this must not be a gpt-oss model on Groq (breaks suspend/resume - see
  // minibuilder-mastra ARCHITECTURE.md §10). Highest call frequency of the three agents.
  model: 'groq/qwen/qwen3.8-27b',
  tools: {
    ask_user: askUserTool,
    delegate_to_po: delegateToPoTool,
    delegate_to_ba: delegateToBaTool,
    start_schedule: startScheduleTool,
    stop_schedule: stopScheduleTool,
  },
  memory: new Memory({
    options: { generateTitle: true },
  }),
  defaultOptions: {
    maxSteps: 30,
  },
});
