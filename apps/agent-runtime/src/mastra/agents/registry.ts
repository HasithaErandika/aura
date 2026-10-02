import { GEMINI_FALLBACK_MODEL } from '../config/models';

// Each agent's model, versions and note; tool wiring stays in each agent's file and is printed at startup.
// Heavy tier is gpt-oss-120b; light tier is qwen3.8-27b, which fails Groq tool calling, so it never gets
// an agent that holds tools (docs/logs/qa-tester-run-KAN-36.md).
export const ORCHESTRATOR_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - holds tools
export const PO_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - low-volume, gates every later stage
export const BA_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy
export const ARCHITECT_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy
export const QA_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - test plan and scenario specs
export const DEPLOYER_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy
export const VSCODE_AGENT_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - holds workspace tools (ADR-4)
export const CODER_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - VS Code coder specialists, hold workspace tools
// No tools; a different model family from the coders, since two copies of one model tend to agree.
export const EVALUATOR_MODEL_ID = GEMINI_FALLBACK_MODEL;


export type AgentId = 'orchestrator' | 'po-agent' | 'ba-agent' | 'architect-agent' | 'qa-agent' | 'deployer-agent' | 'vscode-agent' | 'task-planner' | 'coder' | 'evaluator' | 'git-agent';

export interface AgentManifestEntry {
  modelId: string;
  delegatesTo: readonly AgentId[];
  note: string;
  // Name stamped on every artifact this agent produces.
  label: string;
  // Bump when the tool contract, schema or delegation changes.
  agentVersion: string;
  // Bump whenever the agent's instructions change, then re-record its eval baseline.
  promptVersion: string;
}

export const AGENT_MANIFEST: Record<AgentId, AgentManifestEntry> = {
  orchestrator: {
    label: 'Orchestrator',
    modelId: ORCHESTRATOR_MODEL_ID,
    delegatesTo: ['po-agent', 'ba-agent', 'architect-agent', 'qa-agent', 'deployer-agent'],
    note: 'Coordinates the web pipeline: Gates 1-3, the test plan and Gate 8. Never drafts, files, or executes directly - no Jira, memory, filesystem, or shell tool of its own. Tasks are built in VS Code.',
    agentVersion: '2.0.0', // V7: web gates only; scaffold, coding, test, git and CI tools removed
    promptVersion: '3.0.0', // V7: web gates only
  },
  'po-agent': {
    label: 'PO Agent',
    modelId: PO_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts/revises an Epic as structured JSON only, invoked through delegate_to_po. Holds no tools: cannot read or write Jira itself.',
    agentVersion: '1.0.0',
    promptVersion: '1.1.0', // untrusted Jira/requester text fenced (gateway/untrusted.ts)
  },
  'ba-agent': {
    label: 'BA Agent',
    modelId: BA_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts/revises Stories as structured JSON only, invoked through delegate_to_ba. Holds no tools: cannot read or write Jira itself.',
    agentVersion: '1.0.0',
    promptVersion: '1.1.0', // untrusted Jira/requester text fenced (gateway/untrusted.ts)
  },
  'architect-agent': {
    label: 'Architect Agent',
    modelId: ARCHITECT_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts/revises a decomposition, frontend/API/integration/data/security/AI design, ADRs, and architecture tasks as structured JSON, invoked through delegate_to_architect. Holds no tools: cannot read or write Jira itself. Filed documents are saved to Postgres (design_documents), not to disk.',
    agentVersion: '1.1.0',
    promptVersion: '1.2.0', // frontend and integration specialists added to architect-workflow
  },
  'qa-agent': {
    label: 'QA Agent',
    modelId: QA_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts a test plan and scenarios from the approved Stories, invoked through delegate_to_qa. Holds no tools; file mode saves the plan and scenarios as design documents (Postgres) and comments the Epic.',
    agentVersion: '3.0.0', // V7: no QA workspace, no revise-scenario
    promptVersion: '2.2.0', // V7: results come from CI on the PR
  },
  'deployer-agent': {
    label: 'Deployer Agent',
    modelId: DEPLOYER_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts release notes, a change plan, and a rollback plan from filed Tasks (delegate_to_deploy, Gate 8) - plan-only, no execute mode exists: there is no real deployment pipeline to run, so this agent never claims a release happened.',
    agentVersion: '1.0.0',
    promptVersion: '1.1.0', // untrusted Jira/requester text fenced (gateway/untrusted.ts)
  },
  'vscode-agent': {
    label: 'VS Code Agent',
    modelId: VSCODE_AGENT_MODEL_ID,
    delegatesTo: [],
    note: "The developer's agent (ADR-4): a Mastra Workspace on the folder open in VS Code, reached through apps/api and the extension, which applies the developer's permission rules. Runs a Task through Gate 4 (delegate_to_planner), Gate 5 (delegate_to_coder, delegate_to_review) and Gate 6 (delegate_to_pr), with design_docs, skills and project memory.",
    agentVersion: '0.6.0', // V6: Gate 6 pull request (delegate_to_pr), CI status
    promptVersion: '3.2.0', // Task flow: … → Gate 5 → PR (Gate 6) → CI
  },
  'git-agent': {
    label: 'Git agent',
    modelId: 'none (deterministic)',
    delegatesTo: [],
    note: 'Gate 6 of a Task in VS Code, invoked through delegate_to_pr: code drafts the pull request (title, description with provenance, reviewers), and after the developer approves it commits the accepted change, pushes the Task branch and opens the PR to development with the developer\'s own git and gh, then records it in AURA for QA (task/pr.ts). status reads the PR and its CI result. No model call.',
    agentVersion: '1.0.0',
    promptVersion: '1.0.0',
  },
  'task-planner': {
    label: 'Task Planner',
    modelId: VSCODE_AGENT_MODEL_ID,
    delegatesTo: [],
    note: 'The Gate 4 plan of a Task in VS Code, invoked through delegate_to_planner. The VS Code agent reads the code and proposes the plan as structured input; code validates it, routes the Task to a coder (task/router.ts) and stores it as a draft. No Mastra Agent object backs this entry.',
    agentVersion: '1.0.0',
    promptVersion: '1.0.0',
  },
  coder: {
    label: 'Coders and Evaluator',
    modelId: `coders ${CODER_MODEL_ID}; Evaluator ${EVALUATOR_MODEL_ID}`,
    delegatesTo: ['evaluator'],
    note: 'Implements an approved Task plan in the developer\'s VS Code, invoked through delegate_to_coder (execute after Gate 4; revise after a Gate 5 "Revise"). The router picks one of frontend-react, backend-nestjs, backend-spring, issue-solver, test-writer (agents/coders.ts); code runs the checks and reads the diff; the Evaluator reviews; code decides whether a round passed (task/loop.ts), up to vscode.evaluatorRounds rounds. delegate_to_review accept records Gate 5.',
    agentVersion: '1.0.0',
    promptVersion: '1.0.0',
  },
  evaluator: {
    label: 'Evaluator',
    modelId: EVALUATOR_MODEL_ID,
    delegatesTo: [],
    note: 'Reviews a coder\'s real diff and check output against the approved plan; no tools, structured verdict only (agents/coders.ts). Its approval alone never passes a round: failing checks or a blocker/major finding fail it in code.',
    agentVersion: '1.0.0',
    promptVersion: '1.0.0',
  },
};

// Prints each agent's real tool wiring, as resolved live by the caller.
export function printManifest(actualToolsByAgent: Record<AgentId, readonly string[]>): void {
  const lines = (Object.keys(AGENT_MANIFEST) as AgentId[]).map((id) => {
    const entry = AGENT_MANIFEST[id];
    const tools = actualToolsByAgent[id];
    const toolsLabel = tools.length ? tools.join(', ') : '(none)';
    const delegates = entry.delegatesTo.length ? ` -> delegates to: ${entry.delegatesTo.join(', ')}` : '';
    return `  ${id.padEnd(12)} model=${entry.modelId.padEnd(28)} tools=[${toolsLabel}]${delegates}`;
  });
  console.info(['[agents] manifest (see agents/registry.ts):', ...lines].join('\n'));
}
