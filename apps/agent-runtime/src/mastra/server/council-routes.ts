import { registerApiRoute } from '@mastra/core/server';
import { draftStore } from '../store/draft-store';
import { addCouncilNote } from '../store/council-notes';
import { usageToday } from '../store/usage-store';
import type { CodingTaskDraft } from '../contracts/coding-drafts';
import { AGENT_MANIFEST, COUNCIL_IMPLEMENTER_MODEL_IDS, COUNCIL_PLANNER_MODEL_IDS, COUNCIL_REVIEWER_MODEL_IDS } from '../agents/registry';
import { createImplementer, createPlanner, createReviewer } from '../agents/council-agents';
import { councilSettings } from '../workflows/coding-council';

// Coding Council side channels (workflows/coding-council.ts). Reached only through apps/api,
// which checks the caller's role and audits every note - these routes trust that gate, the same
// way the dev-workspace routes do.

// POST /council/:draftId/notes { text } - queues a human note for the council's next agent turn.
// Accepted until the run has finished; a note for a finished run would never be read.
export const addCouncilNoteRoute = registerApiRoute('/council/:draftId/notes', {
  method: 'POST',
  handler: async (c) => {
    try {
      const draftId = c.req.param('draftId');
      const body = await c.req.json<{ text?: string }>();
      const text = body.text?.trim();
      if (!text) return c.json({ error: 'text is required' }, 400);
      const record = draftId ? await draftStore.get<CodingTaskDraft>(draftId) : null;
      if (!record || record.kind !== 'coding-task') return c.json({ error: `unknown coding draft ${draftId}` }, 404);
      if (record.content.provider !== 'council') return c.json({ error: `${draftId} is not a Coding Council run` }, 409);
      if (record.filed.status === 'done') return c.json({ error: `${draftId} has already finished` }, 409);
      return c.json({ queued: addCouncilNote(record.id, text), taskKey: record.content.taskKey });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  },
});

// GET /council/usage - today's model requests/tokens, for `aura status`.
export const councilUsageRoute = registerApiRoute('/council/usage', {
  method: 'GET',
  handler: async (c) => c.json(await usageToday()),
});

// GET /council/registry - the Coding Council as the Agent Registry should show it. The council's
// agents are built per run and never registered in mastra.agents (their tools are bound to one
// worktree), so /api/agents cannot list them; this reports the same shape, read live from real
// agent instances (their actual tools) and the registry's model chains, so the Registry page
// never drifts from the code. Tools are listed once each, labelled with the roles that hold them.
export const councilRegistryRoute = registerApiRoute('/council/registry', {
  method: 'GET',
  handler: async (c) => {
    const roles = [
      { role: 'Planner', agent: createPlanner(process.cwd()), models: COUNCIL_PLANNER_MODEL_IDS },
      { role: 'Implementer', agent: createImplementer(process.cwd()), models: COUNCIL_IMPLEMENTER_MODEL_IDS },
      { role: 'Reviewer', agent: createReviewer(), models: COUNCIL_REVIEWER_MODEL_IDS },
    ];
    const tools: Record<string, { id: string; description: string; roles: string[] }> = {};
    for (const { role, agent } of roles) {
      for (const [id, tool] of Object.entries(await agent.listTools())) {
        const description = (tool as { description?: string }).description ?? '';
        tools[id] ??= { id, description, roles: [] };
        tools[id].roles.push(role);
      }
    }
    const settings = councilSettings();
    const manifest = AGENT_MANIFEST['coding-council'];
    return c.json({
      'coding-council': {
        name: manifest.label,
        description:
          `Gate 5 coding provider "council": a Planner, an Implementer and a Reviewer discuss the work - plan, critique, implement, run the project's own checks, review the real diff - for up to ${settings.maxRounds} review round(s) (plan critique: ${settings.planRounds}), within a ${settings.tokenBudget.toLocaleString()}-token budget. ` +
          roles.map(({ role, models }) => `${role}: ${models.join(' → ')}.`).join(' ') +
          ' A failing check always means CHANGES; the Task moves to In Review only if the Reviewer approves.',
        modelId: manifest.modelId,
        supportsMemory: false,
        defaultOptions: { maxSteps: settings.implementerSteps },
        tools: Object.fromEntries(Object.values(tools).map((t) => [t.id, { id: t.id, description: `[${t.roles.join(', ')}] ${t.description}` }])),
        metadata: {
          agentVersion: manifest.agentVersion,
          promptVersion: manifest.promptVersion,
          roles: roles.map(({ role, models, agent }) => ({ role, id: agent.id, models })),
        },
      },
    });
  },
});
