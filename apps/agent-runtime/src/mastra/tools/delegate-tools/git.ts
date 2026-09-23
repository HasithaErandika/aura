import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { gitOps, gitOpFiledComment, renderGitOpPlan, type GitOpDraft } from '../../contracts/git-drafts';
import { draftStore } from '../../store/draft-store';
import { jira } from '../../mcp/jira-client';
import { devWorkspaceDir } from '../../workspace/dev-workspace';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { disciplineFromTask, provenance, buildProvenance, AURA_GIT_IDENTITY, type ProvenanceStamp } from './shared';

const execFileAsync = promisify(execFile);

// ==================== Git workspace tool ====================

const gitInputSchema = z
  .object({
    mode: z.enum(['draft', 'execute', 'read']),
    epicKey: z.string().optional().describe('draft and read: the Epic this Task belongs to'),
    taskKey: z.string().optional().describe('draft and read: the Jira Task key whose scaffolded directory to operate on'),
    op: z.enum(['init', 'branch', 'commit', 'status', 'diff']).optional().describe('draft: one of init, branch, commit. read: one of status, diff.'),
    branchName: z.string().optional().describe('draft with op=branch only: the branch name to create; defaults to task/<taskKey>'),
    draftId: z.string().optional().describe('execute: the draftId returned by draft'),
    approved: z.boolean().optional().describe('execute: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const gitOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable plan or output. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  taskKey: z.string().optional(),
  error: z.string().optional(),
  provenance: z.custom<ProvenanceStamp>().optional(),
});

function gitFail(error: unknown): z.infer<typeof gitOutputSchema> {
  const withStderr = error as { stderr?: unknown; message?: unknown } | null;
  const message = withStderr && typeof withStderr === 'object' && withStderr.stderr ? String(withStderr.stderr) : error instanceof Error ? error.message : String(error);
  return { ok: false, error: message };
}

// Resolves a Task's scaffolded directory (same lookup delegate_to_code uses), for git commands
// to run directly against - no Docker, git runs on the host as the same user that owns the
// scaffolded files (node:22-slim has no git installed anyway, and this directory is already
// host-trusted - docs/ARCHITECTURE.md section 6.4).
async function taskTargetDir(taskKey: string, epicKey: string): Promise<{ targetDir: string; discipline: string } | { error: string }> {
  const task = await jira.getIssue(taskKey);
  if (task.issueType && task.issueType.toLowerCase() !== 'task') return { error: `${taskKey} is a ${task.issueType}, not a Task` };
  const discipline = disciplineFromTask(task.description || '');
  if (!discipline) return { error: `Could not read a discipline off ${taskKey} - it should carry "**Discipline:** <name>"` };
  return { targetDir: await devWorkspaceDir(epicKey, discipline), discipline };
}

export const delegateToGitTool = createTool({
  id: 'delegate_to_git',
  description:
    'Git workspace tool for a scaffolded Task\'s directory. read: epicKey + taskKey + op ("status" or "diff") -> runs immediately, no approval needed (non-mutating). draft: epicKey + taskKey + op ("init", "branch", or "commit") -> a fixed git command (returns draftId + markdown) - the command and, for commit, its message are built deterministically, never chosen by a model. execute: draftId + approved -> runs it directly on the host (no Docker - git runs against the same host-owned directory Gate 4/5 already write to) and comments the Task. Never execute without an explicit human approval.',
  inputSchema: gitInputSchema,
  outputSchema: gitOutputSchema,
  execute: async (input, { agent }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        case 'read': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const taskKey = input.taskKey?.trim().toUpperCase();
          if (!epicKey || !taskKey) return gitFail('read needs epicKey and taskKey');
          if (input.op !== 'status' && input.op !== 'diff') return gitFail('read needs op "status" or "diff"');
          const resolved = await taskTargetDir(taskKey, epicKey);
          if ('error' in resolved) return gitFail(resolved.error);
          const args = input.op === 'status' ? ['status', '--short'] : ['diff'];
          try {
            const r = await execFileAsync('git', args, { cwd: resolved.targetDir });
            return { ok: true, epicKey, taskKey, markdown: '```\n' + (r.stdout.trim() || '(clean - nothing to show)') + '\n```' };
          } catch (error) {
            return gitFail(error);
          }
        }
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const taskKey = input.taskKey?.trim().toUpperCase();
          if (!epicKey || !taskKey) return gitFail('draft needs epicKey and taskKey');
          const op = input.op;
          if (op !== 'init' && op !== 'branch' && op !== 'commit') return gitFail(`draft needs op: one of ${gitOps.join(', ')}`);
          const resolved = await taskTargetDir(taskKey, epicKey);
          if ('error' in resolved) return gitFail(resolved.error);
          const task = await jira.getIssue(taskKey);

          let args: string[] = [];
          let description = '';
          if (op === 'init') {
            description = 'git init (safe even if this directory is already a repo - git no-ops in that case).';
          } else if (op === 'branch') {
            const branchName = input.branchName?.trim() || `task/${taskKey}`;
            args = [branchName];
            description = `git checkout -b ${branchName}`;
          } else {
            const message = `${taskKey}: ${task.summary} (AURA)`;
            args = [message];
            description = `git add -A && git commit -m "${message}"`;
          }

          const content: GitOpDraft = { epicKey, taskKey, targetDir: resolved.targetDir, op, args, description };
          const record = await draftStore.create({ kind: 'git-op', content, threadId, epicKey });
          return { ok: true, draftId: record.id, epicKey, taskKey, markdown: renderGitOpPlan(content) };
        }
        case 'execute': {
          if (!input.draftId) return gitFail('execute needs draftId');
          if (input.approved !== true) return gitFail('execute requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<GitOpDraft>(input.draftId);
          if (!record || record.kind !== 'git-op') return gitFail(`unknown git draft ${input.draftId}`);
          if (record.filed.status === 'done') {
            return { ok: true, draftId: record.id, epicKey: record.content.epicKey, taskKey: record.content.taskKey, markdown: 'Already ran. Nothing was run twice.' };
          }

          const { targetDir, op, args } = record.content;
          let output = '';
          let exitCode = 0;
          try {
            if (op === 'init') {
              const r = await execFileAsync('git', ['init'], { cwd: targetDir });
              output = r.stdout + r.stderr;
            } else if (op === 'branch') {
              const r = await execFileAsync('git', ['checkout', '-b', ...args], { cwd: targetDir });
              output = r.stdout + r.stderr;
            } else {
              const add = await execFileAsync('git', ['add', '-A'], { cwd: targetDir });
              const commit = await execFileAsync('git', [...AURA_GIT_IDENTITY, 'commit', '-m', args[0] ?? 'AURA commit'], { cwd: targetDir });
              output = add.stdout + add.stderr + commit.stdout + commit.stderr;
            }
          } catch (error) {
            const execError = error as { stdout?: string; stderr?: string; code?: number | null; message: string };
            exitCode = execError.code ?? 1;
            output = (execError.stdout ?? '') + (execError.stderr ?? '') || execError.message;
          }

          await draftStore.markFiled(record.id, { status: 'done', exitCode: String(exitCode) });
          const stamp = provenance('git-tool', 'deterministic (no model)', record, `${record.content.taskKey} (Task)`);
          try {
            await jira.addComment(record.content.taskKey, gitOpFiledComment(record.content, exitCode, output, stamp));
          } catch {
            // Informational only; the git operation itself already ran.
          }

          if (exitCode !== 0) {
            return { ok: false, draftId: record.id, epicKey: record.content.epicKey, taskKey: record.content.taskKey, error: `git ${op} failed (exit ${exitCode}). Output:\n${output.slice(-2000)}` };
          }
          return {
            ok: true,
            draftId: record.id,
            epicKey: record.content.epicKey,
            taskKey: record.content.taskKey,
            markdown: `git ${op} finished.\n\n\`\`\`\n${output.trim().slice(-1500) || '(no output)'}\n\`\`\``,
            provenance: buildProvenance('git-tool', 'deterministic (no model)', record, `${record.content.taskKey} (Task)`),
          };
        }
      }
    } catch (error) {
      return gitFail(error);
    }
  },
});
