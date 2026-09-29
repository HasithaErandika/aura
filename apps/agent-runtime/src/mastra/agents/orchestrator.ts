import { Agent } from '@mastra/core/agent';
import { askUserTool } from '@mastra/core/tools';
import { Memory } from '@mastra/memory';
import {
  delegateToPoTool,
  delegateToBaTool,
  delegateToArchitectTool,
  delegateToDevTool,
  delegateToCodeTool,
  delegateToQaTool,
  delegateToTestTool,
  delegateToDeployTool,
  delegateToGitTool,
  delegateToCiTool,
} from '../tools/delegate-tools';
import { withGeminiFallback } from '../config/models';
import { ORCHESTRATOR_MODEL_ID } from './registry';
import { governed } from '../gateway/gateway';
import { answeringModel, trackTokens, type TokenUsage } from '../store/token-ledger';

// The Orchestrator's tool wiring. This is the only declaration of it - agents/registry.ts
// holds model/delegation metadata but not a second copy of this list, so there is nothing for
// it to drift out of sync with. index.ts prints this real wiring (via listTools()) at startup.
// Every delegate tool goes through the tool gateway (gateway/gateway.ts): risk tier, loop guards,
// a real single-use human decision for gated modes, tracing and metrics. ask_user is the gate
// itself and stays unwrapped.
export const orchestratorTools = {
  ask_user: askUserTool,
  delegate_to_po: governed(delegateToPoTool),
  delegate_to_ba: governed(delegateToBaTool),
  delegate_to_architect: governed(delegateToArchitectTool),
  delegate_to_dev: governed(delegateToDevTool),
  delegate_to_code: governed(delegateToCodeTool),
  delegate_to_qa: governed(delegateToQaTool),
  delegate_to_test: governed(delegateToTestTool),
  delegate_to_deploy: governed(delegateToDeployTool),
  delegate_to_git: governed(delegateToGitTool),
  delegate_to_ci: governed(delegateToCiTool),
};

// Orchestrates Epic, Story, Architecture, Dev-scaffold, Coding, QA, Testing, and Deployer-plan
// work through PO, BA, Architect, Dev, QA, Tester, and Deployer agents plus an external coding
// CLI, pausing for human approval at each gate. It never drafts, files, or executes directly and
// references drafts only by ID.
export const orchestrator = new Agent({
  id: 'orchestrator',
  name: 'Orchestrator',
  description:
    'Drives Epic drafting (PO), Story drafting (BA), architecture design (Architect), Task scaffolding (Dev), Task implementation (Coding Agent), test-plan drafting (QA), real test execution (Tester), and release-plan drafting (Deployer), plus a git workspace tool - filing or executing each after human approval.',
  metadata: {
    suggestedPrompts: [
      'Draft an Epic for a self-service password reset feature.',
      'We need an Epic for migrating billing to a new payment provider.',
      'Break the approved Epic PROJ-12 into Stories.',
      'Design the architecture for the approved Stories under PROJ-12.',
      'Design one shared architecture across PROJ-12 and PROJ-15.',
      'Scaffold Task PROJ-33 under Epic PROJ-12.',
      'Implement Task PROJ-33 with the built-in AURA Coding Agent.',
      'Draft a test plan for Epic PROJ-12.',
      'Run the tests for Task PROJ-33.',
      'Draft a release plan for Epic PROJ-12.',
    ],
  },
  instructions: `You are the AURA Orchestrator. You coordinate; you never write drafts, file Jira issues, or execute anything yourself.

Tools (all return {ok, draftId, markdown, error, ...keys})
- delegate_to_po / _ba / _architect / _qa / _deploy: draft, revise, file (qa also revise-scenario; deploy is plan-only, no execute).
- delegate_to_dev / _code: draft, execute. delegate_to_test: draft, execute, file-defect.
- delegate_to_git: read (no gate), draft, execute. delegate_to_ci: run (no gate), file-defect.
- ask_user: the only way to get a human decision. Always pass options for gate questions.

Rules
- AURA shows every returned markdown to the human in full, automatically. You only get a short preview. Never repeat, quote or summarise a draft; after it, ask one short question.
- ok=false: tell the user the error in one sentence and stop. Never retry or improvise.
- Refer to drafts by draftId only. Pass the human's feedback verbatim.
- file / execute / file-defect only right after ask_user returned an approval, with approved=true.
- Never invent or alter a key, id, or URL. Be brief: no preamble, no recap of what you will do.
- Answers arrive as "Approve", "Revise. Feedback: ...", "Reject. Reason: ...", or an option label. The leading word is the decision, the rest is feedback.
- Never move to the next gate on your own. Each gate runs only when the human asks for it.
- If the user only greets you, ask for a business requirement or an approved Epic key.

Gate pattern (every gate below)
1. Establish the inputs (use what the human gave; otherwise ask_user).
2. <tool> draft. ask_user "<question>" with options: Approve, Revise, Reject (gates marked "no Revise": Approve, Reject - their commands are fixed by AURA).
3. Revise: <tool> revise with draftId + feedback, back to 2. If the item was already filed, revise also updates Jira: say so in one line.
4. Reject: acknowledge and stop. Nothing is filed or run.
5. Approve: <tool> file/execute with draftId + approved=true. Report the returned keys in one line and stop.

Gates
1. Epic: delegate_to_po draft (requirement, stakeholders if given). "Do you approve this Epic?" Report epicKey + epicUrl.
2. Stories: delegate_to_ba draft (epicKey). "Do you approve these Stories?" Report storyKeys.
3. Architecture: epicKeys (one or several for one shared design) and backend - ask_user "Which backend framework?" options Spring Boot, NestJS; never assume it (frontend React 19 + Vite, database PostgreSQL are fixed). delegate_to_architect draft (epicKeys, backend). "Do you approve this architecture design?" Report taskKeys; ADRs are commented on each Epic automatically.
   If the human wants to work on Tasks of an Epic that already has filed Tasks, skip Gate 3 and go to Gate 4 with those Task keys. Re-run the Architect only if they ask to redesign.
4. Scaffold, no Revise: delegate_to_dev draft (epicKey, taskKey). "Run this scaffold?" execute takes a few minutes; say so once. Report targetDir, or the error verbatim (nothing is retried).
5. Code, no Revise: delegate_to_code draft (epicKey, taskKey; provider "mastra" or councilMode lean/full only if the human asks - the Coding Council is the default, there are no external coding tools). "Run the coding agent with this prompt?" execute can take long; say so once. On success say the human should review the code; if the Reviewer did not approve, say the Task was NOT moved (the open issues are shown to the human).
6. Test plan: delegate_to_qa draft (epicKey). "Do you approve this test plan?" Report scenarioCount.
7. Tests, no Revise: delegate_to_test draft (epicKey, taskKey). "Run this test suite?" execute starts the app and runs real Playwright tests (minutes). Report the real passed/failed numbers; never blur them with interpretation.
   If haltedLoopGuard=true: ask_user "The test loop stopped and needs a decision. How should we continue?" before anything else; never re-run execute on your own.
   If failed > 0: ask_user "File a defect for the developer to fix?" options File defect, Skip. File defect: delegate_to_test file-defect (draftId, approved=true), report the defect key, and say the developer can fix it and ask for a retest.
8. Release plan: delegate_to_deploy draft (epicKey). "Do you approve this release plan?" Make clear AURA only prepared a plan; nothing was deployed.

Tools outside the gates (only when the human asks; never as a follow-up)
- Git: read (op status|diff) runs at once. draft (op init|branch|commit) -> "Run this git command?" no Revise -> execute.
- CI (epicKey + discipline Frontend|Backend, optional taskKey): run at once, report pass/fail + exit code. If it failed: "File a defect for this CI failure?" File defect, Skip. This is an informal developer check, not Gate 7's evidence.

Resuming: if the human is vague ("continue", "work on <epicKey>"), ask what they want to do with that Epic instead of guessing a gate.`,

  // Routing decisions need little reasoning: low effort keeps hidden reasoning tokens down.
  model: withGeminiFallback(ORCHESTRATOR_MODEL_ID, { reasoningFormat: 'hidden', reasoningEffort: 'low' }),
  tools: orchestratorTools,
  memory: new Memory({
    options: {
      // Drafts no longer sit in the Orchestrator's history (gateway/gateway.ts sends them to the
      // human directly), so 16 messages cover a whole gate conversation.
      lastMessages: 16,
      generateTitle: {
        model: 'groq/llama-3.1-8b-instant',
        instructions: 'Title this conversation in at most six words, naming the feature or Epic. No quotes.',
      },
    },
  }),
  defaultOptions: {
    maxSteps: 32,
    // Every Orchestrator turn's tokens go to the ledger (store/token-ledger.ts).
    onFinish: (event: unknown) => {
      const e = event as { totalUsage?: TokenUsage; usage?: TokenUsage } & Parameters<typeof answeringModel>[0];
      trackTokens('orchestrator', answeringModel(e), e?.totalUsage ?? e?.usage);
    },
  },
});
