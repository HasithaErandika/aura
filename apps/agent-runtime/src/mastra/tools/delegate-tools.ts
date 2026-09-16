import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const delegateOutputSchema = z.object({
  ok: z.boolean().describe('false means the sub-agent failed - read result for the exact error, do not retry.'),
  result: z.string(),
});

// Delegates a task to a sub-agent, turning a thrown error into a normal { ok: false } result.
async function delegate(agentId: string, task: string, mastra: { getAgent: (id: string) => any } | undefined) {
  const agent = mastra?.getAgent(agentId);
  if (!agent) {
    return { ok: false, result: `DELEGATE FAILED: agent "${agentId}" is not registered.` };
  }
  try {
    const { text } = await agent.generate(task);
    return { ok: true, result: text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, result: `DELEGATE FAILED: ${message}` };
  }
}

// Gate 1: draft/revise an Epic, or (once the Orchestrator has human approval) file it in Jira.
export const delegateToPoTool = createTool({
  id: 'delegate_to_po',
  description: 'PO Agent: draft/revise an Epic, or (once approved) file it in Jira.',
  inputSchema: z.object({
    task: z.string().describe('Mode-labeled task string - see orchestrator instructions for content per mode.'),
  }),
  outputSchema: delegateOutputSchema,
  execute: async ({ task }, { mastra }) => delegate('po', task, mastra),
});

// Gate 2: draft/revise Stories from an approved Epic, or (once approved) file them in Jira.
export const delegateToBaTool = createTool({
  id: 'delegate_to_ba',
  description: 'BA Agent: draft/revise Stories from an approved Epic, or (once approved) file them in Jira.',
  inputSchema: z.object({
    task: z.string().describe('Mode-labeled task string - see orchestrator instructions for content per mode.'),
  }),
  outputSchema: delegateOutputSchema,
  execute: async ({ task }, { mastra }) => delegate('ba', task, mastra),
});
