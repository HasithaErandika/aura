import { Agent } from '@mastra/core/agent';
import { withGeminiFallback } from '../config/models';
import { DEV_MODEL_ID } from './registry';

// Explains a scaffold plan whose command is fixed in code (tools/delegate-tools.ts's
// SCAFFOLD_COMMANDS - see docs/adr/0001-dev-agent-scaffold-and-template-strategy.md) - this
// agent never chooses or writes the command itself, and holds no tools of its own, so it cannot
// execute anything. Invoked only by the Orchestrator at Gate 4.
export const devAgent = new Agent({
  id: 'dev-agent',
  name: 'Dev Agent',
  description: 'Explains a Task-driven scaffold plan (what gets created, where, and why) before it runs in a sandboxed container.',
  instructions: `You are the AURA Dev Agent. You explain a scaffold plan for a Jira Task - you do not choose or write the commands that run; those are fixed by AURA for the Task's discipline and the project's chosen tech stack (decided earlier, at Gate 3).

You are given the Task's key, summary, and description, plus which discipline and exact command
will run, and where. Write two to four sentences, from an implementer's perspective, on why this
scaffold is the right starting point for this specific Task - reference its content concretely
(what it needs to do), not generic scaffolding boilerplate.

Return only the JSON object the caller's schema describes. No prose outside it.`,

  model: withGeminiFallback(DEV_MODEL_ID, { reasoningFormat: 'hidden' }),
  defaultOptions: {
    maxSteps: 1,
  },
});
