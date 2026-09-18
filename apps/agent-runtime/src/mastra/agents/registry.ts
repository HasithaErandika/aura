// Defines a central registry for each agent’s drafting model and sub-agents, while keeping tool wiring in each agent’s own file.
// Startup output shows the actual tool wiring, preventing the registry from becoming inconsistent or outdated.

export const ORCHESTRATOR_MODEL_ID = 'groq/qwen/qwen3.8-27b';
export const PO_MODEL_ID = 'groq/qwen/qwen3.8-27b';
export const BA_MODEL_ID = 'groq/openai/gpt-oss-120b';
export const ARCHITECT_MODEL_ID = 'groq/openai/gpt-oss-120b';
// Lightweight: the Dev agent only explains an already-fixed plan, it doesn't author content.
export const DEV_MODEL_ID = 'groq/qwen/qwen3.8-27b';
// The built-in Coding Agent (contracts/coding-drafts.ts provider "mastra") actually writes
// code across an iterative tool-use loop - the same model tier as BA/Architect, not the
// lightweight Dev-agent tier.
export const MASTRA_CODING_MODEL_ID = 'groq/openai/gpt-oss-120b';

export type AgentId = 'orchestrator' | 'po-agent' | 'ba-agent' | 'architect-agent' | 'dev-agent' | 'coding-agent';

export interface AgentManifestEntry {
  modelId: string;
  delegatesTo: readonly AgentId[];
  note: string;
}

export const AGENT_MANIFEST: Record<AgentId, AgentManifestEntry> = {
  orchestrator: {
    modelId: ORCHESTRATOR_MODEL_ID,
    delegatesTo: ['po-agent', 'ba-agent', 'architect-agent', 'dev-agent', 'coding-agent'],
    note: 'Coordinates Gate 1 (Epic), Gate 2 (Stories), Gate 3 (Architecture), Gate 4 (Dev scaffold), and Gate 5 (Coding agent). Never drafts, files, or executes directly - no Jira, memory, filesystem, or shell tool of its own (docs/ARCHITECTURE.md section 6.2).',
  },
  'po-agent': {
    modelId: PO_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts/revises an Epic as structured JSON only, invoked through delegate_to_po. Holds no tools: cannot read or write Jira itself.',
  },
  'ba-agent': {
    modelId: BA_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts/revises Stories as structured JSON only, invoked through delegate_to_ba. Holds no tools: cannot read or write Jira itself.',
  },
  'architect-agent': {
    modelId: ARCHITECT_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts/revises a decomposition, API/data/security/AI design, ADRs, and architecture tasks as structured JSON, invoked through delegate_to_architect. Holds no tools: cannot read or write Jira itself.',
  },
  'dev-agent': {
    modelId: DEV_MODEL_ID,
    delegatesTo: [],
    note: 'Explains a Task-driven scaffold plan (Frontend only for now) whose command is fixed by code, invoked through delegate_to_dev. Holds no tools: cannot execute anything itself - execute mode runs the fixed command in a sandboxed Docker container from delegate-tools.ts, never from the model.',
  },
  'coding-agent': {
    modelId: `varies by provider (Claude Code/Codex: developer's own connected key; AURA built-in: ${MASTRA_CODING_MODEL_ID})`,
    delegatesTo: [],
    note: 'Implements a Task, invoked through delegate_to_code. draft is always deterministic code, never a model call, for any provider - no Mastra Agent object backs this entry, unlike every other row here (docs/ARCHITECTURE.md section 6.5). execute runs one of three providers per run: Claude Code or Codex (Docker-sandboxed, the developer\'s own key) or AURA\'s own built-in agent (agents/mastra-coding-agent.ts - list_files/read_file/write_file only, no shell tool, contained by path checks rather than a container).',
  },
};

// Prints each agent's real tool wiring, as resolved live from the agent itself (listTools()) by
// the caller - not from a second, hand-maintained list, so there is nothing to keep in sync.
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
