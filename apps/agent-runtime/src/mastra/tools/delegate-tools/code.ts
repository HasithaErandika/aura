import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { codingFiledComment, codingProviderLabel, codingProviders, renderCodingPlan, type CodingProvider, type CodingTaskDraft } from '../../contracts/coding-drafts';
import { draftStore } from '../../store/draft-store';
import { jira } from '../../mcp/jira-client';
import { isDockerAvailable, runInContainer } from '../../lib/docker-exec';
import { createCodingAgent } from '../../agents/mastra-coding-agent';
import { devWorkspaceDir } from '../../workspace/dev-workspace';
import { readdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { provenance, disciplineFromTask } from './shared';

// Filename the coding prompt is written to inside the target directory before the container
// starts, so it only ever exists as file content - never interpolated into a shell string
// built from Task text (see CODING_COMMANDS' "$(cat ...)" below, a safe, non-recursive shell
// substitution: it captures the file's bytes as one literal argument, it does not re-evaluate
// anything inside them).
const PROMPT_FILE = '.aura-task-prompt.txt';

// Fixed, code-defined invocations per coding CLI - never chosen or written by a model. Flags
// verified against each tool's real `--help` output, not assumed. Both already run inside
// AURA's own Docker sandbox, so each is told not to layer its own interactive approval on top:
// Claude Code's `--dangerously-skip-permissions` bypasses its prompt-per-edit flow; Codex's
// `--sandbox workspace-write --ask-for-approval never` is the less blunt equivalent - Codex
// offers a tiered sandbox rather than only an all-or-nothing bypass, so that is preferred here
// over its own `--dangerously-bypass-approvals-and-sandbox`.
// Claude Code and Codex authenticate via their own CLI login (a browser/OAuth flow run once,
// interactively, outside AURA - `claude login` / `codex login`), not an API key. AURA never
// asks for or stores a key for either: it mounts the developer's own already-logged-in
// credential file from the host running agent-runtime (read-only) into the sandbox, so the CLI
// inside the container is authenticated as whoever is running AURA - the same "runs as the
// host user" trust boundary docker-exec.ts already uses for file ownership.
const CODING_COMMANDS: Record<Exclude<CodingProvider, 'mastra'>, { image: string; command: string; hostCredential: string; containerCredential: string; loginHint: string }> = {
  anthropic: {
    image: 'node:22-slim',
    command: `npm install -g @anthropic-ai/claude-code --silent && claude -p --dangerously-skip-permissions --output-format json "$(cat ${PROMPT_FILE})"`,
    hostCredential: path.join(os.homedir(), '.claude', '.credentials.json'),
    containerCredential: '/tmp/.claude/.credentials.json',
    loginHint: 'Run `claude login` on this machine (the one running agent-runtime), then approve this again.',
  },
  openai: {
    image: 'node:22-slim',
    command: `npm install -g @openai/codex --silent && codex exec --sandbox workspace-write --ask-for-approval never --json "$(cat ${PROMPT_FILE})"`,
    hostCredential: path.join(os.homedir(), '.codex', 'auth.json'),
    containerCredential: '/tmp/.codex/auth.json',
    loginHint: 'Run `codex login` on this machine (the one running agent-runtime), then approve this again.',
  },
};

const codingInputSchema = z
  .object({
    mode: z.enum(['draft', 'execute']),
    epicKey: z.string().optional().describe('draft: the Epic this Task belongs to'),
    taskKey: z.string().optional().describe('draft: the Jira Task key to implement (must already be scaffolded via delegate_to_dev)'),
    provider: z.enum(codingProviders).optional().describe('draft: which coding agent to use - "mastra" (AURA\'s own built-in agent) is the main option; "anthropic" (Claude Code) and "openai" (Codex) are available if the human specifically wants them. Ask the human, never assume.'),
    draftId: z.string().optional().describe('execute: the draftId returned by draft'),
    approved: z.boolean().optional().describe('execute: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const codingOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable draft. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  taskKey: z.string().optional(),
  targetDir: z.string().optional(),
  exitCode: z.number().optional(),
  error: z.string().optional(),
});

function codeFail(error: unknown): z.infer<typeof codingOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export const delegateToCodeTool = createTool({
  id: 'delegate_to_code',
  description:
    "Coding Agent. 'mastra' (AURA's own built-in agent, always available) is the main option - use it unless the human asks for Claude Code or Codex specifically. draft: epicKey + taskKey + provider ('mastra' for AURA's own built-in agent, 'anthropic' for Claude Code, 'openai' for Codex) -> a deterministic plan built from the Task's own content, no model call (returns draftId + markdown with the exact prompt). execute: draftId + approved -> for mastra, runs AURA's own agent directly against the scaffolded directory (list_files/read_file/write_file only, no shell access); for anthropic/openai, runs that CLI inside the sandboxed container using the developer's own CLI login on this machine (claude login / codex login - not an API key). Either way it then comments the Task and moves it toward In Review. Never execute without an explicit human approval. Fails clearly if the Task has not been scaffolded yet (run delegate_to_dev first) or, for anthropic/openai, if that CLI has not been logged into on this machine.",
  inputSchema: codingInputSchema,
  outputSchema: codingOutputSchema,
  execute: async (input, { agent, writer }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        // Builds the plan deterministically from the Task itself - discipline routes to the
        // same directory the Dev agent scaffolded (delegate_to_dev must have run first).
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const taskKey = input.taskKey?.trim().toUpperCase();
          if (!epicKey || !taskKey) return codeFail('draft needs epicKey, taskKey, and provider');
          if (!input.provider) return codeFail('draft needs a provider - ask the human "Claude Code" (anthropic) or "Codex" (openai) before drafting');
          const task = await jira.getIssue(taskKey);
          if (task.issueType && task.issueType.toLowerCase() !== 'task') return codeFail(`${taskKey} is a ${task.issueType}, not a Task`);
          const discipline = disciplineFromTask(task.description || '');
          if (!discipline) return codeFail(`Could not read a discipline off ${taskKey} - it should carry "**Discipline:** <name>"`);

          const targetDir = await devWorkspaceDir(epicKey, discipline);
          let scaffolded = false;
          try {
            scaffolded = (await readdir(targetDir)).length > 0;
          } catch {
            scaffolded = false;
          }
          if (!scaffolded) return codeFail(`${taskKey} has not been scaffolded yet - run delegate_to_dev for it first (Gate 4), then come back here`);

          const prompt = [
            `Implement Jira Task ${taskKey}: ${task.summary}`,
            '',
            task.description || '(no description)',
            '',
            'Work only within this directory. Make the acceptance criteria above pass. Do not touch files outside it, and do not run destructive commands.',
          ].join('\n');

          const content: CodingTaskDraft = { epicKey, taskKey, discipline, targetDir, provider: input.provider, prompt };
          const record = await draftStore.create({ kind: 'coding-task', content, threadId, epicKey });
          return { ok: true, draftId: record.id, markdown: renderCodingPlan(content), epicKey, taskKey };
        }
        // Fetches the human's own connected key just-in-time (never persisted here), writes
        // the prompt to a file, and runs the fixed CLI invocation for the drafted provider.
        // Idempotent: a draft already executed just reports its prior result.
        case 'execute': {
          if (!input.draftId) return codeFail('execute needs draftId');
          if (input.approved !== true) return codeFail('execute requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<CodingTaskDraft>(input.draftId);
          if (!record || record.kind !== 'coding-task') return codeFail(`unknown coding draft ${input.draftId}`);

          if (record.filed.status === 'done') {
            return {
              ok: true,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              targetDir: record.content.targetDir,
              exitCode: Number(record.filed.exitCode ?? '0'),
              markdown: `Already ran (exit code ${record.filed.exitCode ?? '0'}). Nothing was run twice.`,
            };
          }

          try {
            await writeFile(path.join(record.content.targetDir, PROMPT_FILE), record.content.prompt, 'utf8');
          } catch (error) {
            return codeFail(error);
          }

          let result: { exitCode: number; output: string };
          if (record.content.provider === 'mastra') {
            // Built-in agent: no external credential, no Docker - runs in-process, contained
            // entirely by its own tool surface (list_files/read_file/write_file, path-checked
            // against record.content.targetDir - see tools/file-tools.ts).
            try {
              const codingAgent = createCodingAgent(record.content.targetDir);
              const response = await codingAgent.generate(record.content.prompt, { maxSteps: 20 });
              const summary = response.text?.trim() || '(the agent made changes but returned no summary text)';
              void writer?.custom({ type: 'data-code-output', data: { chunk: summary }, transient: true });
              result = { exitCode: 0, output: summary };
            } catch (error) {
              result = { exitCode: 1, output: error instanceof Error ? error.message : String(error) };
            }
          } else {
            const cli = CODING_COMMANDS[record.content.provider];

            try {
              await access(cli.hostCredential);
            } catch {
              return codeFail(`${codingProviderLabel[record.content.provider]} is not logged in on this machine. ${cli.loginHint}`);
            }

            if (!(await isDockerAvailable())) return codeFail('Docker is not available - install/start Docker to run the coding agent');

            try {
              result = await runInContainer({
                image: cli.image,
                hostDir: record.content.targetDir,
                command: cli.command,
                mounts: [{ hostPath: cli.hostCredential, containerPath: cli.containerCredential, readOnly: true }],
                timeoutMs: 20 * 60_000,
                name: `aura-code-${record.id}`,
                labels: { 'aura.epic': record.content.epicKey, 'aura.task': record.content.taskKey, 'aura.kind': 'code' },
                onOutput: (chunk) => {
                  void writer?.custom({ type: 'data-code-output', data: { chunk }, transient: true });
                },
              });
            } catch (error) {
              return codeFail(error);
            }
          }

          await draftStore.markFiled(record.id, { status: 'done', exitCode: String(result.exitCode) });
          const stamp = provenance('Coding Agent', codingProviderLabel[record.content.provider], record, `${record.content.taskKey} (Task)`);
          try {
            await jira.addComment(record.content.taskKey, codingFiledComment(record.content, result.exitCode, result.output, stamp));
          } catch {
            // The comment is informational; the code on disk is what matters.
          }
          if (result.exitCode === 0) {
            try {
              const transitions = await jira.getTransitions(record.content.taskKey);
              const inReview = transitions.find((t) => t.name.toLowerCase() === 'in review');
              if (inReview) await jira.transitionIssue(record.content.taskKey, inReview.id);
            } catch {
              // Best-effort; proceed regardless.
            }
          }

          if (result.exitCode !== 0) {
            return {
              ok: false,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              exitCode: result.exitCode,
              error: `Coding agent failed (exit code ${result.exitCode}). Last output:\n${result.output.slice(-2000)}`,
            };
          }
          return {
            ok: true,
            draftId: record.id,
            epicKey: record.content.epicKey,
            taskKey: record.content.taskKey,
            targetDir: record.content.targetDir,
            exitCode: result.exitCode,
            markdown: `Coding agent finished at ${record.content.targetDir}. Review the changes before merging.`,
          };
        }
      }
    } catch (error) {
      return codeFail(error);
    }
  },
});
