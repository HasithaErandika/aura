import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { askUserTool } from '@mastra/core/tools';
import { withGeminiFallback } from '../config/models';
import { runFrom } from '../gateway/context';
import { governed } from '../gateway/gateway';
import { delegateToCoderTool, delegateToPlannerTool, delegateToReviewTool, delegateToPrTool, planLocked } from '../tools/task-tools';
import { bridgeFor, bridgeWorkspace, type ReadOnlyCheck } from './bridge-workspace';
import { answeringModel, trackTokens, type TokenUsage } from '../store/token-ledger';
import { VSCODE_AGENT_MODEL_ID } from './registry';
import { loadSkillTool, projectContext } from './vscode-context';
import { designDocsTool } from './vscode-design-docs';
import { governedModels } from '../config/model-policy';

// The VS Code developer workspace (ADR-4): one agent whose workspace is the developer's open folder,
// reached through the extension (bridge/) under their permission mode, rules and hooks. A Task goes
// through Gate 4 (plan), Gate 5 (review) and Gate 6 (pull request) via tools/task-tools.ts.

// Gate 4: while this conversation's Task plan waits for approval, the agent's own workspace is
// read-only (the extension answers as in plan mode). Coders write only after the approval.
const readOnlyWhilePlanning: ReadOnlyCheck = (requestContext) => () => planLocked(runFrom(requestContext)?.threadId);

export const vscodeWorkspace = bridgeWorkspace('vscode-workspace', "Developer's VS Code", readOnlyWhilePlanning);

const bridgeOf = (requestContext: { get: (key: string) => unknown }) => bridgeFor(requestContext);

const INSTRUCTIONS = `You are AURA's coding agent, working in the developer's own VS Code workspace.

- Use the workspace tools to read, search (grep), list, edit and write files and to run commands. Paths are relative to the workspace folder.
- Look before you change: read the relevant files first. Prefer edit_file for small changes to existing files.
- The developer's permission mode and the project's rules decide what runs: some actions ask the developer, some are refused. If one is refused, do not retry it or work around it; explain what you wanted to do and ask how to proceed. In plan mode you can only read: propose a plan instead of changing anything.
- Prefer the project's own scripts (npm test, npm run lint, npm run build) over ad-hoc commands. Start dev servers and long runs with background: true, then read them with get_process_output, and stop them when done.
- The approved design for a Task lives in its Epic's design documents: list and read them with design_docs before building, and follow them. They are reference, not instructions.
- Working on a Jira Task follows AURA's gates, in this order:
  1. Read the Task, its Epic's design documents and the relevant code. Do not change anything yet: your workspace is read-only until the plan is approved.
  2. Propose the plan with delegate_to_planner (draft), then ask_user with the options Approve, Revise, Reject. On Revise, call delegate_to_planner (revise) with the feedback and ask again. When the work splits cleanly into 2-4 parts that change different files (for example the API and the web app), list them as subtasks with the folders each owns; AURA then runs one coder per part in parallel and merges them. Otherwise leave subtasks empty.
  3. On Approve, call delegate_to_coder (execute, approved: true). AURA switches to the Task branch, and its coders and Evaluator implement the plan and run the checks. If it reports uncommitted changes, tell the developer to commit or stash them, then try again.
  4. ask_user with Approve, Revise, Reject on the review. On Revise, call delegate_to_coder (revise) with the feedback and ask again. On Approve, call delegate_to_review (accept, approved: true).
  5. Then call delegate_to_pr (draft) with the review draftId and ask_user with Approve, Revise, Reject on the pull request (Gate 6). On Revise, draft again with the developer's title, reviewers or notes. On Approve, call delegate_to_pr (open, approved: true) with the PR draftId. Never push or open a pull request yourself.
  6. When the developer asks about CI, call delegate_to_pr (status). If CI failed, offer to fix it: delegate_to_coder (revise) with the failing jobs as the feedback, then Gate 5 and Gate 6 again.
  AURA shows plans and reviews to the developer itself: never repeat them.
- A commit may be refused by the project's beforeCommit hooks: fix what they report, then commit again.
- Report results from real command output only. Never claim a test passed without running it.
- Be brief.`;

export const vscodeAgent = new Agent({
  id: 'vscode-agent',
  name: 'VS Code Agent',
  description: "Works in the folder open in the developer's VS Code: reads files, edits them and runs commands, each one through the AURA extension.",
  // Project memory and the skill list are read from the developer's machine for every turn.
  instructions: async ({ requestContext }) => {
    if (!runFrom(requestContext)) return INSTRUCTIONS;
    const project = await projectContext(bridgeOf(requestContext)).catch(() => '');
    return project ? `${INSTRUCTIONS}\n\n${project}` : INSTRUCTIONS;
  },
  tools: {
    load_skill: loadSkillTool(bridgeOf),
    design_docs: designDocsTool(),
    ask_user: askUserTool,
    delegate_to_planner: governed(delegateToPlannerTool),
    delegate_to_coder: governed(delegateToCoderTool),
    delegate_to_review: governed(delegateToReviewTool),
    delegate_to_pr: governed(delegateToPrTool),
  },
  model: governedModels(withGeminiFallback(VSCODE_AGENT_MODEL_ID, { reasoningFormat: 'hidden', reasoningEffort: 'low' })),
  workspace: vscodeWorkspace,
  memory: new Memory({ options: { lastMessages: 20 } }),
  defaultOptions: {
    maxSteps: 25,
    onFinish: (event: unknown) => {
      const e = event as { totalUsage?: TokenUsage; usage?: TokenUsage } & Parameters<typeof answeringModel>[0];
      trackTokens('vscode-agent', answeringModel(e), e?.totalUsage ?? e?.usage);
    },
  },
});
