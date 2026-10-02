import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { Workspace } from '@mastra/core/workspace';
import { withGeminiFallback } from '../config/models';
import { runFrom } from '../gateway/context';
import { bridgeCaller } from '../bridge/client';
import { BridgeFilesystem, BridgeSandbox } from '../bridge/workspace';
import { answeringModel, trackTokens, type TokenUsage } from '../store/token-ledger';
import { VSCODE_AGENT_MODEL_ID } from './registry';

// V0 of the VS Code developer workspace (ADR-4, docs/plans/aura-vscode-agents.md): one agent
// whose workspace is the folder open in the developer's VS Code. Files and commands are reached
// through the AURA extension (bridge/), which asks the developer before any write or command.
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

export const vscodeAgent = new Agent({
  id: 'vscode-agent',
  name: 'VS Code Agent',
  description: "Works in the folder open in the developer's VS Code: reads files, edits them and runs commands, each one through the AURA extension.",
  instructions: `You are AURA's coding agent, working in the developer's own VS Code workspace.

- Use the workspace tools to read files, list folders, edit files and run commands. Paths are relative to the workspace folder.
- Look before you change: read the relevant files first.
- The developer approves every file change and command in VS Code. If one is refused, do not retry it; explain what you wanted to do and ask how to proceed.
- Prefer the project's own scripts (npm test, npm run lint, npm run build) over ad-hoc commands.
- Report results from real command output only. Never claim a test passed without running it.
- Be brief.`,
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
