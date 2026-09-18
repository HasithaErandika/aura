import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { adrSchema, architectureDraftSchema, architectureTaskSchema } from '../contracts/drafts';
import { generateObject } from '../lib/generate-object';

// The Architect's design work as a Mastra Workflow instead of one single-shot agent call
// (docs/ARCHITECTURE.md section 6.3): each section gets its own narrow, validated LLM call
// (higher quality per section than one call doing everything), independent sections run in
// .parallel(), and the step sequence is decided by this code, never by a model - matching
// principle 1 ("agents propose, deterministic systems decide"). Shared read-only context
// (epicKey/epicSummary/storiesText and the sections already written) flows through workflow
// `state`; the four parallel branches return their own section as their *output* instead of
// writing to `state`, since concurrent setState calls on shared state would race.

const ready = z.object({ ready: z.literal(true) });

const stateSchema = z.object({
  epicKey: z.string(),
  epicSummary: z.string(),
  storiesText: z.string(),
  requirementsSummary: z.string(),
  decomposition: z.string(),
  apiDesign: z.string(),
  dataDesign: z.string(),
  securityDesign: z.string(),
  aiDesign: z.string(),
  deploymentAndTestingNotes: z.string(),
});

// Synthesizes requirement themes from the approved Stories into requirementsSummary.
const requirementsAnalysisStep = createStep({
  id: 'requirements-analysis',
  inputSchema: z.object({ epicKey: z.string(), epicSummary: z.string(), storiesText: z.string() }),
  outputSchema: ready,
  stateSchema,
  execute: async ({ inputData, setState, mastra }) => {
    const { epicKey, epicSummary, storiesText } = inputData;
    const prompt = `Synthesize the functional and non-functional requirement themes from these approved Stories for Epic ${epicKey}: ${epicSummary}.\n\nStories:\n${storiesText}\n\nReturn only the JSON the schema describes.`;
    const { requirementsSummary } = await generateObject(mastra, 'architect', prompt, z.object({ requirementsSummary: z.string().min(10) }));
    await setState({
      epicKey,
      epicSummary,
      storiesText,
      requirementsSummary,
      decomposition: '',
      apiDesign: '',
      dataDesign: '',
      securityDesign: '',
      aiDesign: '',
      deploymentAndTestingNotes: '',
    });
    return { ready: true as const };
  },
});

// Decomposes the system into components/services from the requirements synthesis.
const systemDecompositionStep = createStep({
  id: 'system-decomposition',
  inputSchema: ready,
  outputSchema: ready,
  stateSchema,
  execute: async ({ state, setState, mastra }) => {
    const prompt = `Decompose the system for Epic ${state.epicKey}: ${state.epicSummary} into components/services and how they fit together.\n\nRequirements synthesis:\n${state.requirementsSummary}\n\nStories:\n${state.storiesText}\n\nReturn only the JSON the schema describes.`;
    const { decomposition } = await generateObject(mastra, 'architect', prompt, z.object({ decomposition: z.string().min(10) }));
    await setState({ ...state, decomposition });
    return { ready: true as const };
  },
});

// Builds a shared prompt for a design-section step, given the already-assembled state.
function designPrompt(state: z.infer<typeof stateSchema>, focus: string): string {
  return `${focus} for Epic ${state.epicKey}: ${state.epicSummary}, given this decomposition:\n${state.decomposition}\n\nRequirements synthesis:\n${state.requirementsSummary}\n\nReturn only the JSON the schema describes.`;
}

// Designs the API: endpoints, contracts, versioning approach.
const apiDesignStep = createStep({
  id: 'api-design',
  inputSchema: ready,
  outputSchema: z.object({ apiDesign: z.string() }),
  stateSchema,
  execute: async ({ state, mastra }) => {
    const prompt = designPrompt(state, 'Design the API: endpoints, contracts, versioning approach');
    return generateObject(mastra, 'architect', prompt, z.object({ apiDesign: z.string().min(10) }));
  },
});

// Designs the data layer: schema, storage choices, migrations needed.
const dataDesignStep = createStep({
  id: 'data-design',
  inputSchema: ready,
  outputSchema: z.object({ dataDesign: z.string() }),
  stateSchema,
  execute: async ({ state, mastra }) => {
    const prompt = designPrompt(state, 'Design the data layer: schema, storage choices, migrations needed');
    return generateObject(mastra, 'architect', prompt, z.object({ dataDesign: z.string().min(10) }));
  },
});

// Designs security: authN/authZ, data protection, risk tier of new tools or endpoints.
const securityDesignStep = createStep({
  id: 'security-design',
  inputSchema: ready,
  outputSchema: z.object({ securityDesign: z.string() }),
  stateSchema,
  execute: async ({ state, mastra }) => {
    const prompt = designPrompt(state, 'Design security: authN/authZ, data protection, risk tier of new tools or endpoints');
    return generateObject(mastra, 'architect', prompt, z.object({ securityDesign: z.string().min(10) }));
  },
});

// Designs the AI/agent-specific component, or returns an empty string if this Epic has none.
const aiDesignStep = createStep({
  id: 'ai-design',
  inputSchema: ready,
  outputSchema: z.object({ aiDesign: z.string() }),
  stateSchema,
  execute: async ({ state, mastra }) => {
    const prompt = designPrompt(state, 'Design any AI/agent-specific component. If this Epic has no AI/agent component, return an empty string rather than inventing one');
    return generateObject(mastra, 'architect', prompt, z.object({ aiDesign: z.string() }));
  },
});

const parallelOutputSchema = z.object({
  'api-design': z.object({ apiDesign: z.string() }),
  'data-design': z.object({ dataDesign: z.string() }),
  'security-design': z.object({ securityDesign: z.string() }),
  'ai-design': z.object({ aiDesign: z.string() }),
});

// Describes the rollout approach and test coverage needed, from the parallel design outputs.
const deploymentTestingStep = createStep({
  id: 'deployment-testing',
  inputSchema: parallelOutputSchema,
  outputSchema: ready,
  stateSchema,
  execute: async ({ inputData, state, setState, mastra }) => {
    const apiDesign = inputData['api-design'].apiDesign;
    const dataDesign = inputData['data-design'].dataDesign;
    const securityDesign = inputData['security-design'].securityDesign;
    const aiDesign = inputData['ai-design'].aiDesign;
    const prompt = `Describe the rollout approach and what needs test coverage for Epic ${state.epicKey}: ${state.epicSummary}, given:\n\nAPI design:\n${apiDesign}\n\nData design:\n${dataDesign}\n\nSecurity design:\n${securityDesign}\n\nReturn only the JSON the schema describes.`;
    const { deploymentAndTestingNotes } = await generateObject(mastra, 'architect', prompt, z.object({ deploymentAndTestingNotes: z.string().min(10) }));
    await (setState as (s: z.infer<typeof stateSchema>) => Promise<void>)({ ...state, apiDesign, dataDesign, securityDesign, aiDesign, deploymentAndTestingNotes });
    return { ready: true as const };
  },
});

// Produces the Architecture Decision Records and architecture tasks from the full design.
const assembleStep = createStep({
  id: 'assemble',
  inputSchema: ready,
  outputSchema: architectureDraftSchema,
  stateSchema,
  execute: async ({ state, mastra }) => {
    const prompt = `Given the full design below for Epic ${state.epicKey}: ${state.epicSummary}, write the Architecture Decision Records and the architecture tasks. Every Story implied by the requirements synthesis should be implemented by at least one task; set each task's relatedStories to the exact Story keys it implements.\n\nRequirements synthesis:\n${state.requirementsSummary}\n\nDecomposition:\n${state.decomposition}\n\nAPI design:\n${state.apiDesign}\n\nData design:\n${state.dataDesign}\n\nSecurity design:\n${state.securityDesign}\n\nAI design:\n${state.aiDesign || '(none)'}\n\nDeployment and testing notes:\n${state.deploymentAndTestingNotes}\n\nReturn only the JSON the schema describes.`;
    const { adrs, tasks } = await generateObject(mastra, 'architect', prompt, z.object({ adrs: z.array(adrSchema).min(1).max(10), tasks: z.array(architectureTaskSchema).min(1).max(30) }));
    return {
      epicKey: state.epicKey,
      requirementsSummary: state.requirementsSummary,
      decomposition: state.decomposition,
      apiDesign: state.apiDesign,
      dataDesign: state.dataDesign,
      securityDesign: state.securityDesign,
      aiDesign: state.aiDesign,
      deploymentAndTestingNotes: state.deploymentAndTestingNotes,
      adrs,
      tasks,
    };
  },
});

// Runs the Architect's design steps: requirements -> decomposition -> parallel design sections -> deployment notes -> assemble.
export const architectWorkflow = createWorkflow({
  id: 'architect-workflow',
  inputSchema: z.object({ epicKey: z.string(), epicSummary: z.string(), storiesText: z.string() }),
  outputSchema: architectureDraftSchema,
  stateSchema,
})
  .then(requirementsAnalysisStep)
  .then(systemDecompositionStep)
  .parallel([apiDesignStep, dataDesignStep, securityDesignStep, aiDesignStep])
  .then(deploymentTestingStep)
  .then(assembleStep)
  .commit();
