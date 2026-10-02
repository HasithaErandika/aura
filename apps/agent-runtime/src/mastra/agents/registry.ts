import { GEMINI_FALLBACK_MODEL } from '../config/models';

// Each agent's model, versions and note; tool wiring stays in each agent's file and is printed at startup.
// Heavy tier is gpt-oss-120b; light tier is qwen3.8-27b, which fails Groq tool calling, so it never gets
// an agent that holds tools (docs/logs/qa-tester-run-KAN-36.md).
export const ORCHESTRATOR_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - holds tools
export const PO_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - low-volume, gates every later stage
export const BA_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy
export const ARCHITECT_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy
export const DEV_MODEL_ID = 'groq/qwen/qwen3.8-27b'; // light - explains an already-fixed plan, no tools
export const MASTRA_CODING_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - holds tools (file-tools.ts)
export const QA_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - writes real Playwright source
export const TESTER_MODEL_ID = 'groq/qwen/qwen3.8-27b'; // light - interprets an already-real result, no tools
export const DEPLOYER_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy
export const VSCODE_AGENT_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - holds workspace tools (ADR-4)
export const CODER_MODEL_ID = 'groq/openai/gpt-oss-120b'; // heavy - VS Code coder specialists, hold workspace tools
// No tools, structured verdict only - a different model family from the coders, like the
// Council's Reviewer, since two copies of one model tend to agree with each other.
export const EVALUATOR_MODEL_ID = GEMINI_FALLBACK_MODEL;

// Coding Council fallback chains per role. The Planner and Implementer hold tools, so they lead with
// heavy; the Reviewer has none and leads with a different model family than the Implementer.
export const COUNCIL_PLANNER_MODEL_IDS = ['groq/openai/gpt-oss-120b', GEMINI_FALLBACK_MODEL] as const; // heavy - read-only tools
export const COUNCIL_IMPLEMENTER_MODEL_IDS = ['groq/openai/gpt-oss-120b', GEMINI_FALLBACK_MODEL] as const; // heavy - holds write/edit/check tools
export const COUNCIL_REVIEWER_MODEL_IDS = [GEMINI_FALLBACK_MODEL, 'groq/qwen/qwen3.8-27b'] as const; // no tools - structured verdict only

export type AgentId = 'orchestrator' | 'po-agent' | 'ba-agent' | 'architect-agent' | 'dev-agent' | 'coding-agent' | 'coding-council' | 'qa-agent' | 'tester-agent' | 'deployer-agent' | 'git-tool' | 'ci-tool' | 'vscode-agent' | 'task-planner' | 'coder' | 'evaluator' | 'git-agent';

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
  // Bump whenever the agent's instructions change, then re-record its eval baseline.
  promptVersion: string;
}

export const AGENT_MANIFEST: Record<AgentId, AgentManifestEntry> = {
  orchestrator: {
    label: 'Orchestrator',
    modelId: ORCHESTRATOR_MODEL_ID,
    delegatesTo: ['po-agent', 'ba-agent', 'architect-agent', 'dev-agent', 'coding-agent'],
    note: 'Coordinates the web pipeline: Gates 1-3, the QA plan, Gate 8, and the legacy Gates 4, 5 and 7. Never drafts, files, or executes directly - no Jira, memory, filesystem, or shell tool of its own.',
    agentVersion: '1.2.0', // earlier tool calls reach the model as compact results (ToolCallFilter)
    promptVersion: '2.0.0', // compact instructions; drafts shown by AURA, never repeated (token saving)
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
  'dev-agent': {
    label: 'Dev Agent',
    modelId: DEV_MODEL_ID,
    delegatesTo: [],
    note: 'Explains a Task-driven scaffold plan (Frontend and Backend/NestJS) whose command is fixed by code, invoked through delegate_to_dev. Holds no tools: cannot execute anything itself - execute mode runs the fixed command in a sandboxed Docker container from delegate-tools.ts, never from the model. Now project init proper (agentVersion 2.0.0, "Concurrent Task Execution" milestone): the first Task of a discipline scaffolds the shared base repo; every Task (including that first one) then gets its own isolated git worktree/branch off it via ensureTaskWorktree - a second Task of the same discipline never re-scaffolds or shares another Task\'s directory.',
    agentVersion: '2.0.0',
    promptVersion: '1.1.0', // untrusted Jira text fenced (gateway/untrusted.ts)
  },
  'coding-agent': {
    label: 'Coding Agent',
    modelId: `varies by provider (Coding Council: planner ${COUNCIL_PLANNER_MODEL_IDS.join(' → ')}, implementer ${COUNCIL_IMPLEMENTER_MODEL_IDS.join(' → ')}, reviewer ${COUNCIL_REVIEWER_MODEL_IDS.join(' → ')}; single agent: ${MASTRA_CODING_MODEL_ID})`,
    delegatesTo: [],
    note: 'Implements a Task, invoked through delegate_to_code. draft is always deterministic code, never a model call - no Mastra Agent object backs this entry. execute runs one of two AURA-owned providers against the Task\'s own git worktree: the Coding Council (default, see its own entry) or a single built-in agent (agents/mastra-coding-agent.ts - list_files/read_file/write_file only, no shell). Also asked to write/update unit and integration tests (E2E stays QA\'s job). Runs only on AURA-governed models (ADR-3 D6).',
    agentVersion: '3.1.0', // council is the default; commits authored by the Gate 5 approver
    promptVersion: '2.3.0', // untrusted Jira text fenced (gateway/untrusted.ts)
  },
  'coding-council': {
    label: 'Coding Council',
    modelId: `planner ${COUNCIL_PLANNER_MODEL_IDS.join(' → ')} · implementer ${COUNCIL_IMPLEMENTER_MODEL_IDS.join(' → ')} · reviewer ${COUNCIL_REVIEWER_MODEL_IDS.join(' → ')}`,
    delegatesTo: [],
    note: 'Gate 5 provider "council" of the Coding Agent (delegate_to_code), run inside one human-approved execute by workflows/coding-council.ts. Two modes (contracts/council.ts, chosen per Task at draft time): lean skips the Planner and plan review, full runs them. Agents built per run (agents/council-agents.ts), each on its own model chain above: the Planner (full mode only, (read-only list_files/read_file/search_files) writes a Markdown plan); the Reviewer (no tools, structured JSON verdict) critiques the plan and later the real diff plus check output; the Implementer (the only role with write_file/edit_file/run_check) implements and fixes only listed issues. Checks are fixed ids resolved from the project\'s own package.json (lib/sandbox.ts) - a failing check forces CHANGES. Bounded rounds and a token budget; checkpoint commit per round, authored by the Gate 5 approver when they have a git identity (AURA otherwise, always AURA as committer); the Task moves to In Review only when the Reviewer approved. Not registered in mastra.agents (tools are bound to one worktree per run) - GET /council/registry reports it live.',
    agentVersion: '1.1.0', // lean/full modes; checkpoint commits authored by the Gate 5 approver
    promptVersion: '1.0.0',
  },
  'qa-agent': {
    label: 'QA Agent',
    modelId: QA_MODEL_ID,
    delegatesTo: [],
    note: 'Drafts a test plan and real Playwright source per Story, invoked through delegate_to_qa (Gate 6). Holds no tools: reads Stories via delegate-tools.ts, writes nothing itself - file mode saves the plan and scenarios as design documents (Postgres), writes the specs to the QA workspace and comments Jira. Now reads whatever of the actual scaffolded/implemented code exists first (workspace/read-scaffold-context.ts), and can revise a single failing scenario in isolation (revise-scenario) rather than only the whole plan (agentVersion 2.0.0) - see the Tester Agent loop below.',
    agentVersion: '2.0.0',
    promptVersion: '2.1.0', // untrusted Jira text fenced (gateway/untrusted.ts)
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
    agentVersion: '1.0.0',
    promptVersion: '1.1.0', // untrusted Jira/requester text fenced (gateway/untrusted.ts)
  },
  'git-tool': {
    label: 'Git workspace tool',
    modelId: 'none - no model call at any step',
    delegatesTo: [],
    note: 'git init/branch/commit/status/diff against a Task\'s own isolated git worktree, invoked through delegate_to_git. No Mastra Agent object backs this entry (like coding-agent) - the command and, for commit, its message are built entirely by code from the Task\'s own Jira content, never a model. Runs directly on the host, no Docker (node:22-slim has no git installed, and the directory is already host-trusted). `status`/`diff` now show exactly this Task\'s own changes, never another Task\'s sharing the same discipline (agentVersion 2.0.0) - `init` is close to a no-op now, since a worktree is already a real git checkout the moment Gate 4 creates it.',
    agentVersion: '2.1.0', // commit authored by the approver when they have a git identity
    promptVersion: '1.0.0',
  },
  'vscode-agent': {
    label: 'VS Code Agent',
    modelId: VSCODE_AGENT_MODEL_ID,
    delegatesTo: [],
    note: "The VS Code developer workspace (ADR-4): a Mastra Workspace whose filesystem and sandbox are the folder open in the developer's VS Code, reached through apps/api and the AURA extension (bridge/). The extension applies the developer's permission mode and the project's rules and hooks before every write and command. V2 adds native grep, background processes, project memory (.aura/AURA.md) and skills (load_skill). V3 adds design_docs (read an Epic's design documents from Postgres). V4 runs a Task through gates: it proposes the plan (delegate_to_planner, Gate 4; its own writes are read-only until then), the routed coder and the Evaluator implement it (delegate_to_coder), and the developer accepts the review (delegate_to_review, Gate 5).",
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
  'ci-tool': {
    label: 'CI (delegate_to_ci, local run)',
    modelId: 'none - no model call at any step',
    delegatesTo: [],
    note: "Re-runs a scaffolded project's own local checks inside the same Docker sandbox Gates 4/5 use, invoked through delegate_to_ci. No Mastra Agent object backs this entry - the command is read from the project's own config, never chosen by a model. Now accepts an optional taskKey to run against that Task's own isolated worktree instead of the shared base scaffold (agentVersion 1.1.0) - recommended once worktrees are in use, since the base no longer reflects any Task's real changes.",
    agentVersion: '1.1.0',
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
