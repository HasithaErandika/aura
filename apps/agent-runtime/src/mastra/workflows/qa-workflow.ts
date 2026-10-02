import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { qaDraftSchema } from '../contracts/qa-drafts';
import { generateObject } from '../lib/generate-object';

const qaInputSchema = z.object({ epicKey: z.string(), epicSummary: z.string(), storiesText: z.string() });

const planStep = createStep({
  id: 'coverage-and-scenarios',
  inputSchema: qaInputSchema,
  outputSchema: qaDraftSchema,
  execute: async ({ inputData, mastra }) => {
    const { epicKey, epicSummary, storiesText } = inputData;
    const prompt = `Plan test coverage for Epic ${epicKey}: ${epicSummary}.\n\nApproved Stories:\n${storiesText}\n\nFor each Story, decide whether it is covered and by which scenario(s) (ui or api). Return only the JSON the schema describes: a summary, the coverage matrix, and each scenario's title, type, Story key(s), steps and kebab-case fileName. Do not write test source code.`;
    const plan = await generateObject(mastra, 'qa', prompt, qaDraftSchema.omit({ epicKey: true }));
    return { epicKey, ...plan };
  },
});

export const qaWorkflow = createWorkflow({
  id: 'qa-workflow',
  inputSchema: qaInputSchema,
  outputSchema: qaDraftSchema,
})
  .then(planStep)
  .commit();
