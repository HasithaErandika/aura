import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { coverageRowSchema, qaDraftSchema, scenarioTypes } from '../contracts/qa-drafts';
import { generateObject } from '../lib/generate-object';

// The QA Agent's work as a Mastra Workflow (mirrors workflows/architect-workflow.ts): the
// step sequence is fixed by code, never a model. Step 1 decides coverage and scenario shape;
// step 2 writes each scenario's actual Playwright source as its own narrow, validated call - one
// generation per file keeps each call's output focused and reviewable, the same reasoning
// architect-workflow.ts gives for splitting sections instead of one giant call.

const scenarioPlanSchema = z.object({
  title: z.string().min(3).max(200),
  type: z.enum(scenarioTypes),
  storyKeys: z.array(z.string().min(1)).min(1),
  steps: z.array(z.string().min(1)).min(1),
  fileName: z.string().min(3).max(120),
});

const planStep = createStep({
  id: 'coverage-and-scenarios',
  inputSchema: z.object({ epicKey: z.string(), epicSummary: z.string(), storiesText: z.string() }),
  outputSchema: z.object({
    epicKey: z.string(),
    summary: z.string(),
    coverageMatrix: z.array(coverageRowSchema),
    scenarios: z.array(scenarioPlanSchema),
  }),
  execute: async ({ inputData, mastra }) => {
    const { epicKey, epicSummary, storiesText } = inputData;
    const prompt = `Plan test coverage for Epic ${epicKey}: ${epicSummary}.\n\nApproved Stories:\n${storiesText}\n\nFor each Story, decide whether it's covered and by what kind of scenario(s) (ui or api). Return only the JSON the schema describes - scenario titles, types, the Story key(s) each tests, human-readable steps, and a kebab-case fileName for each. Do not write test source code yet.`;
    const { summary, coverageMatrix, scenarios } = await generateObject(
      mastra,
      'qa',
      prompt,
      z.object({ summary: z.string().min(10), coverageMatrix: z.array(coverageRowSchema).min(1), scenarios: z.array(scenarioPlanSchema).min(1).max(30) }),
    );
    return { epicKey, summary, coverageMatrix, scenarios };
  },
});

const writeTestsStep = createStep({
  id: 'write-tests',
  inputSchema: planStep.outputSchema,
  outputSchema: qaDraftSchema,
  execute: async ({ inputData, mastra }) => {
    const { epicKey, summary, coverageMatrix, scenarios: planned } = inputData;
    const scenarios = [];
    for (const scenario of planned) {
      const prompt = `Write the complete, runnable Playwright TypeScript test file for this scenario, testing Epic ${epicKey}.\n\nScenario: ${scenario.title} (${scenario.type})\nTests Story/Stories: ${scenario.storyKeys.join(', ')}\nSteps:\n${scenario.steps.map((s) => `- ${s}`).join('\n')}\n\nReturn only the JSON the schema describes - one field, playwrightSource, containing the full file content (imports included).`;
      const { playwrightSource } = await generateObject(mastra, 'qa', prompt, z.object({ playwrightSource: z.string().min(20) }));
      scenarios.push({ ...scenario, playwrightSource });
    }
    return { epicKey, summary, coverageMatrix, scenarios };
  },
});

export const qaWorkflow = createWorkflow({
  id: 'qa-workflow',
  inputSchema: z.object({ epicKey: z.string(), epicSummary: z.string(), storiesText: z.string() }),
  outputSchema: qaDraftSchema,
})
  .then(planStep)
  .then(writeTestsStep)
  .commit();
