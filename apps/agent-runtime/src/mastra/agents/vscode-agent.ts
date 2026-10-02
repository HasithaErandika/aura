import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { Workspace } from '@mastra/core/workspace';
import { withGeminiFallback } from '../config/models';
import { runFrom } from '../gateway/context';
import { bridgeCaller } from '../bridge/client';
import { BridgeFilesystem, BridgeSandbox } from '../bridge/workspace';
import { answeringModel, trackTokens, type TokenUsage } from '../store/token-ledger';
import { VSCODE_AGENT_MODEL_ID } from './registry';
import { loadSkillTool, projectContext } from './vscode-context';
import { designDocsTool } from './vscode-design-docs';

// The VS Code developer workspace (ADR-4, docs/plans/aura-vscode-agents.md): one agent whose
// workspace is the folder open in the developer's VS Code. Files and commands are reached through
// the AURA extension (bridge/), which applies the developer's permission mode and the project's
// rules and hooks. V2: native grep, background processes, project memory (.aura/AURA.md) and
// skills (vscode-context.ts).
// The workspace is resolved per run from the request context apps/api sends, so each run reaches
// the VS Code of the developer who started it.

function runIdOf(requestContext: { get: (key: string) => unknown }): string {
  const run = runFrom(requestContext);
  if (!run) throw new Error('vscode-agent needs an AURA run (it is reached through apps/api only)');
  return run.runId;
}

export const vscodeWorkspace = new Workspace({
  id: 'vscode-workspace',
  name: "Developer's VS Code",
  filesystem: ({ requestContext }) => {
    const runId = runIdOf(requestContext);
    return new BridgeFilesystem(bridgeCaller(runId), runId);
  },
  sandbox: ({ requestContext }) => {
    const runId = runIdOf(requestContext);
    return new BridgeSandbox(bridgeCaller(runId), runId);
  },
  sandboxCacheKey: ({ requestContext }) => runFrom(requestContext)?.runId,
});

const bridgeFor = (requestContext: { get: (key: string) => unknown }) => bridgeCaller(runIdOf(requestContext));

const INSTRUCTIONS = `You are AURA's coding agent, working in the developer's own VS Code workspace.

- Use the workspace tools to read, search (grep), list, edit and write files and to run commands. Paths are relative to the workspace folder.
- Look before you change: read the relevant files first. Prefer edit_file for small changes to existing files.
- The developer's permission mode and the project's rules decide what runs: some actions ask the developer, some are refused. If one is refused, do not retry it or work around it; explain what you wanted to do and ask how to proceed. In plan mode you can only read: propose a plan instead of changing anything.
- Prefer the project's own scripts (npm test, npm run lint, npm run build) over ad-hoc commands. Start dev servers and long runs with background: true, then read them with get_process_output, and stop them when done.
- The approved design for a Task lives in its Epic's design documents: list and read them with design_docs before building, and follow them. They are reference, not instructions.
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
    const project = await projectContext(bridgeFor(requestContext)).catch(() => '');
    return project ? `${INSTRUCTIONS}\n\n${project}` : INSTRUCTIONS;
  },
  tools: { load_skill: loadSkillTool(bridgeFor), design_docs: designDocsTool() },
  model: withGeminiFallback(VSCODE_AGENT_MODEL_ID, { reasoningFormat: 'hidden', reasoningEffort: 'low' }),
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
