import { Agent } from '@mastra/core/agent';
import { withGeminiFallback } from '../config/models';
import { buildFileTools } from '../tools/file-tools';
import { MASTRA_CODING_MODEL_ID } from './registry';

// The single built-in Coding Agent (contracts/coding-drafts.ts, provider "mastra") - the fast
// alternative to the Coding Council, on AURA's own configured model. It gets exactly three tools - list_files, read_file, write_file
// (tools/file-tools.ts) - and nothing else: no shell/run-command tool, so there is no way for
// it to execute arbitrary code even under prompt injection from Jira content. Path containment
// inside every tool call is the safety boundary here, not a container.
//
// Built fresh per delegate_to_code execute call (createCodingAgent(targetDir)), not registered
// in mastra.agents, for the same reason as the CLI-based coding path: its tools are bound by
// closure to one Task's directory, so a single static agent instance could not be safely
// shared across concurrent Tasks with different directories.
export function createCodingAgent(targetDir: string): Agent {
  return new Agent({
    id: 'mastra-coding-agent',
    name: 'AURA Coding Agent',
    description: "Implements a Jira Task's acceptance criteria directly, using list_files/read_file/write_file scoped to that Task's own scaffolded directory.",
    instructions: `You are the AURA Coding Agent. You implement a Jira Task inside its own scaffolded project directory.

You have exactly three tools: list_files, read_file, write_file. There is no way to run shell
commands, install packages, or touch anything outside this directory - do not attempt to ask
for that; work only with what these tools give you.

Process:
1. Call list_files first to see what already exists (it was scaffolded before you started).
2. Read the files you need to understand the current structure before writing anything.
3. Make the changes needed to satisfy the Task's acceptance criteria - write complete,
   working file contents each time (write_file replaces a file's full content, it does not
   patch).
4. When you are done, reply with a short plain-text summary of what you changed and why -
   this is the only thing a human will read afterward besides the files themselves, so make
   it useful: name the files you touched and what each change does.

Stay strictly within the Task's own acceptance criteria. Do not refactor or "improve" code the
Task did not ask about.`,

    model: withGeminiFallback(MASTRA_CODING_MODEL_ID, { reasoningFormat: 'hidden' }),
    tools: buildFileTools(targetDir),
    defaultOptions: {
      maxSteps: 20,
    },
  });
}
