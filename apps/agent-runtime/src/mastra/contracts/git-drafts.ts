import { z } from 'zod';

// The git workspace tool's plan (delegate_to_git). Entirely deterministic, like Dev/Code plans:
// no model is involved in deciding a git command - the op and its args are fixed by the human's
// choice and code, delegate-tools.ts only builds the exact argv it will run.

export const gitOps = ['init', 'branch', 'commit'] as const;
export type GitOp = (typeof gitOps)[number];

export const gitOpDraftSchema = z.object({
  epicKey: z.string().min(1),
  taskKey: z.string().min(1),
  targetDir: z.string().min(1),
  op: z.enum(gitOps),
  args: z.array(z.string()).describe('Exact argv passed to git after the subcommand, e.g. ["-b", "task/KAN-33"] for branch'),
  description: z.string().min(1).describe('Fixed, human-readable description of exactly what will run'),
});
export type GitOpDraft = z.infer<typeof gitOpDraftSchema>;

export function renderGitOpPlan(draft: GitOpDraft): string {
  return [
    `# Git ${draft.op} for ${draft.taskKey} (${draft.epicKey})`,
    '',
    '*Deterministic - this is a fixed git command, not something a model chose or wrote.*',
    '',
    `**Directory:** ${draft.targetDir}`,
    '',
    '## What will run',
    draft.description,
  ].join('\n');
}

export function gitOpFiledComment(draft: GitOpDraft, exitCode: number, outputTail: string, stamp: string): string {
  const lines = [
    exitCode === 0 ? `AURA git workspace tool ran "git ${draft.op}" for this Task.` : `AURA git workspace tool's "git ${draft.op}" for this Task FAILED (exit code ${exitCode}).`,
    '',
    `Local path: ${draft.targetDir}`,
    `Command: ${draft.description}`,
  ];
  if (outputTail.trim()) lines.push('', '## Output', '```', outputTail.trim().slice(-1500), '```');
  lines.push('', '----', stamp);
  return lines.join('\n');
}
