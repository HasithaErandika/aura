import { GEMINI_FALLBACK_MODEL } from '../config/models';

// Defines a central registry for each agent’s drafting model and sub-agents, while keeping tool wiring in each agent’s own file.
// Startup output shows the actual tool wiring, preventing the registry from becoming inconsistent or outdated.
//
// Model tiers on Groq (see withGeminiFallback, config/models.ts, for the Gemini fallback every
// entry below shares): "heavy" is groq/openai/gpt-oss-120b, "light" is groq/qwen/qwen3.8-27b.
// Heavy is used for every agent that either calls tools directly or authors quality-sensitive,
// low-volume content a human reviews (Epic/Stories/Architecture/QA/Deployer/Coding Agent). Light
// is used only for high-frequency or purely interpretive work with no tool schema attached
// (Dev's fixed-plan explanation, Tester's result summary). This split is load-bearing, not
// stylistic: qwen3.8-27b reliably fails Groq's native tool-calling (it emits the tool call as
// literal text instead of a structured call, and Groq's API rejects it) whenever a tool schema is
// present, but is fully reliable for plain structured-JSON output with no tools attached - so it
// must never be assigned to an agent that holds tools (the Orchestrator, the Coding Agent) or
// receives one via a delegate tool's own model call. Verified directly against Groq's API; see
// docs/logs/qa-tester-run-KAN-36.md for the run that surfaced it.
export const ORCHESTRATOR_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - holds tools
export const PO_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - low-volume, gates every later stage
export const BA_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy
export const ARCHITECT_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy
export const DEV_MODEL_ID = 'groq/qwen/qwen3.8-27b'; // light - explains an already-fixed plan, no tools
export const MASTRA_CODING_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - holds tools (file-tools.ts)
export const QA_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - writes real Playwright source
export const TESTER_MODEL_ID = 'groq/qwen/qwen3.8-27b'; // light - interprets an already-real result, no tools
export const DEPLOYER_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy

// Coding Council (workflows/coding-council.ts, agents/council-agents.ts) - an ordered fallback
// chain per role rather than one id: each later model is tried only when the one before it
// errors, times out, or is rate limited. Same heavy/light rule as above: the Planner and the
// Implementer hold tools, so they lead with heavy; the Reviewer holds NO tools (it answers with
// structured JSON only), which is the one place light qwen is safe - and it deliberately leads
// with a different model family than the Implementer, since two copies of one model tend to
// agree with each other. Free tier today; to move onto Claude, set ANTHROPIC_API_KEY and put
// 'anthropic/claude-sonnet-5' first in each list (see config/models.ts's note on tiers).
export const COUNCIL_PLANNER_MODEL_IDS = ['groq/openai/gpt-oss-120b', GEMINI_FALLBACK_MODEL] as const; // heavy - read-only tools
export const COUNCIL_IMPLEMENTER_MODEL_IDS = ['groq/openai/gpt-oss-120b', GEMINI_FALLBACK_MODEL] as const; // heavy - holds write/edit/check tools
export const COUNCIL_REVIEWER_MODEL_IDS = [GEMINI_FALLBACK_MODEL, 'groq/qwen/qwen3.8-27b'] as const; // no tools - structured verdict only

export type AgentId = 'orchestrator' | 'po-agent' | 'ba-agent' | 'architect-agent' | 'dev-agent' | 'coding-agent' | 'coding-council' | 'qa-agent' | 'tester-agent' | 'deployer-agent' | 'git-tool' | 'ci-tool';

export interface AgentManifestEntry {
  modelId: string;
  delegatesTo: readonly AgentId[];
  note: string;
  // Human-readable name stamped on every artifact this agent produces (see
  // tools/delegate-tools/shared.ts's provenance()).
  label: string;
  // Bump whenever this agent's tool contract, schema, or delegation wiring changes -
  // i.e. anything that changes what the agent can *do*, not what it says.
  agentVersion: string;
  // Bump whenever this agent's system prompt or instructions change - i.e. anything
  // that changes what the model is *told*, independent of its tool contract. Kept
  // separate from agentVersion so a prompt tweak doesn't imply a behavioural contract
  // change, and vice versa. Both start at 1.0.0: no prior version existed to inherit
  // from (docs/ARCHITECTURE.md section 5.3, "only a partial [provenance] stamp exists
  // today" - this registry is the source of truth to bump going forward, by hand,
  // at the same time the prompt/tool file changes).
  promptVersion: string;
}

const V1 = { agentVersion: '1.0.0', promptVersion: '1.0.0' } as const;

export const AGENT_MANIFEST: Record<AgentId, AgentManifestEntry> = {
  orchestrator: {
    label: 'Orchestrator',
    modelId: ORCHESTRATOR_MODEL_ID,
    delegatesTo: ['po-agent', 'ba-agent', 'architect-agent', 'dev-agent', 'coding-agent'],
    note: 'Coordinates Gate 1 (Epic), Gate 2 (Stories), Gate 3 (Architecture), Gate 4 (Dev scaffold), and Gate 5 (Coding agent). Never drafts, files, or executes directly - no Jira, memory, filesystem, or shell tool of its own (docs/ARCHITECTURE.md section 6.2).',
    ...V1,
  },
  'po-agent': {
    label: 'PO Agent',
    modelId: PO_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts/revises an Epic as structured JSON only, invoked through delegate_to_po. Holds no tools: cannot read or write Jira itself.',
    ...V1,
  },
  'ba-agent': {
    label: 'BA Agent',
    modelId: BA_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts/revises Stories as structured JSON only, invoked through delegate_to_ba. Holds no tools: cannot read or write Jira itself.',
    ...V1,
  },
  'architect-agent': {
    label: 'Architect Agent',
    modelId: ARCHITECT_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts/revises a decomposition, API/data/security/AI design, ADRs, and architecture tasks as structured JSON, invoked through delegate_to_architect. Holds no tools: cannot read or write Jira itself.',
    ...V1,
  },
  'dev-agent': {
    label: 'Dev Agent',
    modelId: DEV_MODEL_ID,
    delegatesTo: [],
    note: 'Explains a Task-driven scaffold plan (Frontend and Backend/NestJS) whose command is fixed by code, invoked through delegate_to_dev. Holds no tools: cannot execute anything itself - execute mode runs the fixed command in a sandboxed Docker container from delegate-tools.ts, never from the model. Now project init proper (agentVersion 2.0.0, "Concurrent Task Execution" milestone): the first Task of a discipline scaffolds the shared base repo; every Task (including that first one) then gets its own isolated git worktree/branch off it via ensureTaskWorktree - a second Task of the same discipline never re-scaffolds or shares another Task\'s directory.',
    agentVersion: '2.0.0',
    promptVersion: '1.0.0',
  },
  'coding-agent': {
    label: 'Coding Agent',
    modelId: `varies by provider (Coding Council: planner ${COUNCIL_PLANNER_MODEL_IDS.join(' → ')}, implementer ${COUNCIL_IMPLEMENTER_MODEL_IDS.join(' → ')}, reviewer ${COUNCIL_REVIEWER_MODEL_IDS.join(' → ')}; single agent: ${MASTRA_CODING_MODEL_ID})`,
    delegatesTo: [],
    note: 'Implements a Task, invoked through delegate_to_code. draft is always deterministic code, never a model call - no Mastra Agent object backs this entry (docs/ARCHITECTURE.md section 6.5). execute runs one of two AURA-owned providers against the Task\'s own git worktree: the Coding Council (default, see its own entry) or a single built-in agent (agents/mastra-coding-agent.ts - list_files/read_file/write_file only, no shell). Also asked to write/update unit and integration tests (E2E stays QA\'s job). The external Claude Code / Codex CLI providers, which ran on developers\' personal logins in Docker, were removed (ADR-3 D6, agentVersion 3.0.0).',
    agentVersion: '3.0.0',
    promptVersion: '2.2.0',
  },
  'coding-council': {
    label: 'Coding Council',
    modelId: `planner ${COUNCIL_PLANNER_MODEL_IDS.join(' → ')} · implementer ${COUNCIL_IMPLEMENTER_MODEL_IDS.join(' → ')} · reviewer ${COUNCIL_REVIEWER_MODEL_IDS.join(' → ')}`,
    delegatesTo: [],
    note: 'Gate 5 provider "council" of the Coding Agent (delegate_to_code), run inside one human-approved execute by workflows/coding-council.ts. Three agents built per run (agents/council-agents.ts), each on its own model chain above: the Planner (read-only list_files/read_file/search_files) writes a Markdown plan; the Reviewer (no tools, structured JSON verdict) critiques the plan and later the real diff plus check output; the Implementer (the only role with write_file/edit_file/run_check) implements and fixes only listed issues. Checks are fixed ids resolved from the project\'s own package.json (lib/sandbox.ts) - a failing check forces CHANGES. Bounded rounds and a token budget; checkpoint commit per round; the Task moves to In Review only when the Reviewer approved. Not registered in mastra.agents (tools are bound to one worktree per run) - GET /council/registry reports it live.',
    ...V1,
  },
  'qa-agent': {
    label: 'QA Agent',
    modelId: QA_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts a test plan and real Playwright source per Story, invoked through delegate_to_qa (Gate 6). Holds no tools: reads Stories via delegate-tools.ts, writes nothing itself - file mode writes the QA workspace and comments Jira. Now reads whatever of the actual scaffolded/implemented code exists first (workspace/read-scaffold-context.ts), and can revise a single failing scenario in isolation (revise-scenario) rather than only the whole plan (agentVersion 2.0.0) - see the Tester Agent loop below.',
    agentVersion: '2.0.0',
    promptVersion: '2.0.0',
  },
  'tester-agent': {
    label: 'Tester Agent',
    modelId: TESTER_MODEL_ID,
    delegatesTo: [],
    note: 'Gate 7 is a bounded test -> diagnose -> route -> retest loop (workflows/tester-workflow.ts), not a single pass: it runs the real Playwright suite, and on failure collects evidence (machine output, git commit, test source) and diagnoses each failure through an infra/startup/env/test/app-defect/requirements-ambiguity hierarchy before routing to the Coding Agent (code defect), back to QA (bad test - revises only the failing scenario), or a human (anything low-confidence or unclear - it never guesses on an "unsure" diagnosis). Retries automatically up to 3 attempts, then halts (HALTED_LOOP_GUARD) for a human. It never decides pass/fail on the machine result itself - that always comes from Playwright\'s own JSON output. Now always tests the Task\'s own isolated git worktree, never a shared directory another Task could also be changing (agentVersion 2.1.0).',
    agentVersion: '2.1.0',
    promptVersion: '2.0.0',
  },
  'deployer-agent': {
    label: 'Deployer Agent',
    modelId: DEPLOYER_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts release notes, a change plan, and a rollback plan from filed Tasks (delegate_to_deploy, Gate 8) - plan-only, no execute mode exists: there is no real deployment pipeline to run, so this agent never claims a release happened.',
    ...V1,
  },
  'git-tool': {
    label: 'Git workspace tool',
    modelId: 'none - no model call at any step',
    delegatesTo: [],
    note: 'git init/branch/commit/status/diff against a Task\'s own isolated git worktree, invoked through delegate_to_git. No Mastra Agent object backs this entry (like coding-agent) - the command and, for commit, its message are built entirely by code from the Task\'s own Jira content, never a model. Runs directly on the host, no Docker (node:22-slim has no git installed, and the directory is already host-trusted). `status`/`diff` now show exactly this Task\'s own changes, never another Task\'s sharing the same discipline (agentVersion 2.0.0) - `init` is close to a no-op now, since a worktree is already a real git checkout the moment Gate 4 creates it.',
    agentVersion: '2.0.0',
    promptVersion: '1.0.0',
  },
  'ci-tool': {
    label: 'CI (delegate_to_ci, local run)',
    modelId: 'none - no model call at any step',
    delegatesTo: [],
    note: "Re-runs a scaffolded project's own local checks inside the same Docker sandbox Gates 4/5 use, invoked through delegate_to_ci. No Mastra Agent object backs this entry - the command is read from the project's own config, never chosen by a model. Now accepts an optional taskKey to run against that Task's own isolated worktree instead of the shared base scaffold (agentVersion 1.1.0) - recommended once worktrees are in use, since the base no longer reflects any Task's real changes.",
    agentVersion: '1.1.0',
    promptVersion: '1.0.0',
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
