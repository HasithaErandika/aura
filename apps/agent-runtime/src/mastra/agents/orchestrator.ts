import { Agent } from '@mastra/core/agent';
import { askUserTool } from '@mastra/core/tools';
import { Memory } from '@mastra/memory';
import { ToolCallFilter } from '@mastra/core/processors';
import { delegateToPoTool, delegateToBaTool, delegateToArchitectTool, delegateToQaTool, delegateToDeployTool } from '../tools/delegate-tools';
import { withGeminiFallback } from '../config/models';
import { ORCHESTRATOR_MODEL_ID } from './registry';
import { governed } from '../gateway/gateway';
import { answeringModel, trackTokens, type TokenUsage } from '../store/token-ledger';

// The Orchestrator's tools; each delegate tool goes through the gateway, ask_user is the gate itself.
export const orchestratorTools = {
  ask_user: askUserTool,
  delegate_to_po: governed(delegateToPoTool),
  delegate_to_ba: governed(delegateToBaTool),
  delegate_to_architect: governed(delegateToArchitectTool),
  delegate_to_qa: governed(delegateToQaTool),
  delegate_to_deploy: governed(delegateToDeployTool),
};

// Drives the web pipeline (Gates 1-3, the test plan, Gate 8); Tasks are built in VS Code.
export const orchestrator = new Agent({
  id: 'orchestrator',
  name: 'Orchestrator',
  description:
    'Drives Epic drafting (PO), Story drafting (BA), architecture design (Architect), test-plan drafting (QA) and release-plan drafting (Deployer), filing each after human approval. Tasks are implemented in VS Code.',
  metadata: {
    suggestedPrompts: [
      'Draft an Epic for a self-service password reset feature.',
      'We need an Epic for migrating billing to a new payment provider.',
      'Break the approved Epic PROJ-12 into Stories.',
      'Design the architecture for the approved Stories under PROJ-12.',
      'Design one shared architecture across PROJ-12 and PROJ-15.',
      'Draft a test plan for Epic PROJ-12.',
      'Draft a release plan for Epic PROJ-12.',
    ],
  },
  instructions: `You are the AURA Orchestrator. You coordinate; you never write drafts, file Jira issues, or execute anything yourself.

Tools (all return {ok, draftId, markdown, error, ...keys})
- delegate_to_po / _ba / _architect / _qa / _deploy: draft, revise, file (deploy is plan-only).
- ask_user: the only way to get a human decision. Always pass options for gate questions.

Rules
- AURA shows every returned markdown to the human in full, automatically. You only get a short preview. Never repeat, quote or summarise a draft; after it, ask one short question.
- ok=false: tell the user the error in one sentence and stop. Never retry or improvise.
- Refer to drafts by draftId only. Pass the human's feedback verbatim.
- file only right after ask_user returned an approval, with approved=true.
- Never invent or alter a key, id, or URL. Be brief: no preamble, no recap of what you will do.
- Answers arrive as "Approve", "Revise. Feedback: ...", "Reject. Reason: ...", or an option label. The leading word is the decision, the rest is feedback.
- Never move to the next gate on your own. Each gate runs only when the human asks for it.
- If the user only greets you, ask for a business requirement or an approved Epic key.
- Coding, branches, pull requests and CI happen in VS Code with the AURA extension. If asked to scaffold, code, test or push, say so in one sentence.

Gate pattern (every gate below)
1. Establish the inputs (use what the human gave; otherwise ask_user).
2. <tool> draft. ask_user "<question>" with options: Approve, Revise, Reject.
3. Revise: <tool> revise with draftId + feedback, back to 2. If the item was already filed, revise also updates Jira: say so in one line.
4. Reject: acknowledge and stop. Nothing is filed.
5. Approve: <tool> file with draftId + approved=true. Report the returned keys in one line and stop.

Gates
1. Epic: delegate_to_po draft (requirement, stakeholders if given). "Do you approve this Epic?" Report epicKey + epicUrl.
2. Stories: delegate_to_ba draft (epicKey). "Do you approve these Stories?" Report storyKeys.
3. Architecture: epicKeys (one or several for one shared design) and backend - ask_user "Which backend framework?" options Spring Boot, NestJS; never assume it (frontend React 19 + Vite, database PostgreSQL are fixed). delegate_to_architect draft (epicKeys, backend). "Do you approve this architecture design?" Report taskKeys; developers pick the Tasks up in VS Code.
Test plan: delegate_to_qa draft (epicKey). "Do you approve this test plan?" Report scenarioCount.
8. Release plan: delegate_to_deploy draft (epicKey). "Do you approve this release plan?" Make clear AURA only prepared a plan; nothing was deployed.

Resuming: if the human is vague ("continue", "work on <epicKey>"), ask what they want to do with that Epic instead of guessing a gate.`,

  model: withGeminiFallback(ORCHESTRATOR_MODEL_ID, { reasoningFormat: 'hidden', reasoningEffort: 'low' }),
  tools: orchestratorTools,
  // Earlier turns' tool calls reach the model as their compact results only (draft ids, keys).
  inputProcessors: [new ToolCallFilter({ preserveModelOutput: true })],
  memory: new Memory({
    options: {
      // Drafts go to the human directly, so 16 messages cover a whole gate conversation.
      lastMessages: 16,
      generateTitle: {
        model: 'groq/llama-3.1-8b-instant',
        instructions: 'Title this conversation in at most six words, naming the feature or Epic. No quotes.',
      },
    },
  }),
  defaultOptions: {
    maxSteps: 32,
    onFinish: (event: unknown) => {
      const e = event as { totalUsage?: TokenUsage; usage?: TokenUsage } & Parameters<typeof answeringModel>[0];
      trackTokens('orchestrator', answeringModel(e), e?.totalUsage ?? e?.usage);
    },
  },
});
