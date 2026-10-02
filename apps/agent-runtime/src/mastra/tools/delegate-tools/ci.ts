import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { access } from 'node:fs/promises';
import { jira } from '../../mcp/jira-client';
import { devWorkspaceDir, taskWorktreeDir } from '../../workspace/dev-workspace';
import path from 'node:path';
import { isDockerAvailable, runInContainer } from '../../lib/docker-exec';
import { draftStore } from '../../store/draft-store';
import { provenance, buildProvenance, type ProvenanceStamp } from './shared';
import { ciStepsToShellScript } from './dev';

// Runs a discipline's project checks locally in the Docker sandbox, with the same steps as its
// checked-in CI workflow (dev.ts CI_STEPS). `run` changes nothing, so it is not gated; `file-defect`
// writes a Jira Bug and is gated. Scheduled for removal in V7 (CI runs on GitHub via aura-ci.yml).

interface CiRunDraft {
  epicKey: string;
  discipline: 'Frontend' | 'Backend';
  taskKey: string | null;
}

const ciInputSchema = z
  .object({
    mode: z.enum(['run', 'file-defect']),
    epicKey: z.string().optional().describe('run: the Epic whose project to run CI against'),
    discipline: z.enum(['Frontend', 'Backend']).optional().describe('run: which project (must already exist via delegate_to_dev)'),
    taskKey: z
      .string()
      .optional()
      .describe("run: a specific Task's own isolated worktree to run CI against (recommended - tests that Task's real code). Omit to run against the shared base scaffold instead, which reflects no Task's changes once worktrees are in use."),
    draftId: z.string().optional().describe('file-defect: the draftId returned by a failed run'),
    approved: z.boolean().optional().describe('file-defect: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const ciOutputSchema = z.object({
  ok: z.boolean().describe('false means CI failed, or the step could not run at all; read error.'),
  draftId: z.string().optional(),
  epicKey: z.string().optional(),
  discipline: z.string().optional(),
  exitCode: z.number().optional(),
  defectKey: z.string().optional().describe('file-defect: the Jira Bug key created for the developer to pick up.'),
  markdown: z.string().optional().describe('The CI run output, or the defect confirmation. Show it to the user verbatim.'),
  error: z.string().optional(),
  provenance: z.custom<ProvenanceStamp>().optional(),
});

function ciFail(error: unknown): z.infer<typeof ciOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export const delegateToCiTool = createTool({
  id: 'delegate_to_ci',
  description:
    "Runs a project's checked-in CI steps locally in a sandboxed container, a preview before pushing. run: epicKey + discipline (Frontend|Backend) + optional taskKey (tests that Task's own worktree) -> runs at once, no approval (changes nothing); ok=false means CI failed. file-defect: draftId + approved, after a failed run -> Jira Bug under the Epic.",
  inputSchema: ciInputSchema,
  outputSchema: ciOutputSchema,
  execute: async (input, { writer, agent }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        case 'run': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const discipline = input.discipline;
          const taskKey = input.taskKey?.trim().toUpperCase() || null;
          if (!epicKey || !discipline) return ciFail('run needs epicKey and discipline (Frontend or Backend)');

          const baseDir = await devWorkspaceDir(epicKey, discipline);
          const targetDir = taskKey ? taskWorktreeDir(baseDir, taskKey) : baseDir;
          try {
            await access(taskKey ? path.join(targetDir, '.git') : targetDir);
          } catch {
            return ciFail(
              taskKey
                ? `${taskKey} has no isolated worktree yet - run delegate_to_dev for it first (Gate 4)`
                : `${discipline} under ${epicKey} has not been scaffolded yet - run delegate_to_dev for a Task in that discipline first (Gate 4)`,
            );
          }
          if (!(await isDockerAvailable())) return ciFail('Docker is not available - install/start Docker to run CI locally');

          let result: { exitCode: number; output: string };
          try {
            result = await runInContainer({
              image: 'mcr.microsoft.com/playwright:v1.48.0-jammy',
              hostDir: targetDir,
              command: ciStepsToShellScript(discipline),
              timeoutMs: 10 * 60_000,
              name: `aura-ci-${epicKey}-${discipline}-${taskKey ?? 'base'}-${Date.now()}`.toLowerCase(),
              labels: { 'aura.epic': epicKey, 'aura.kind': 'ci', ...(taskKey ? { 'aura.task': taskKey } : {}) },
              onOutput: (chunk) => {
                void writer?.custom({ type: 'data-ci-output', data: { chunk }, transient: true });
              },
            });
          } catch (error) {
            return ciFail(error);
          }

          const content: CiRunDraft = { epicKey, discipline, taskKey };
          const record = await draftStore.create({ kind: 'ci-run', content, threadId, epicKey });
          await draftStore.markFiled(record.id, { exitCode: String(result.exitCode), output: result.output.slice(-4000) });

          const label = taskKey ? `${epicKey} / ${taskKey} (${discipline})` : `${epicKey} (${discipline}, base scaffold)`;
          if (result.exitCode !== 0) {
            return {
              ok: false,
              draftId: record.id,
              epicKey,
              discipline,
              exitCode: result.exitCode,
              error: `CI failed (exit code ${result.exitCode}) for ${label}. Last output:\n${result.output.slice(-2000)}`,
            };
          }
          return { ok: true, draftId: record.id, epicKey, discipline, exitCode: result.exitCode, markdown: `CI passed for ${label}.\n\n\`\`\`\n${result.output.trim().slice(-2000)}\n\`\`\`` };
        }
        case 'file-defect': {
          if (!input.draftId) return ciFail('file-defect needs draftId');
          if (input.approved !== true) return ciFail('file-defect requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<CiRunDraft>(input.draftId);
          if (!record || record.kind !== 'ci-run') return ciFail(`unknown CI run draft ${input.draftId}`);
          const exitCode = Number(record.filed.exitCode ?? '0');
          if (exitCode === 0) return ciFail('The last CI run passed - there is nothing to file a defect for');
          if (record.filed.defectFiled === 'done') {
            return { ok: true, draftId: record.id, epicKey: record.content.epicKey, discipline: record.content.discipline, defectKey: record.filed.defectKey, markdown: `Already filed as ${record.filed.defectKey}. Nothing was filed twice.` };
          }

          const stamp = provenance('ci-tool', 'deterministic (no model) - see .github/workflows', record, `${record.content.epicKey} (Epic, ${record.content.discipline} project)`);
          const description = [
            `Local CI failed (exit code ${exitCode}) for the ${record.content.discipline} project under Epic ${record.content.epicKey}.`,
            '',
            'Last output:',
            '```',
            record.filed.output || '(no output captured)',
            '```',
            '',
            `Fix, then ask AURA to run CI for ${record.content.discipline} under ${record.content.epicKey} again to retest.`,
            '',
            '----',
            stamp,
          ].join('\n');

          let created: { key: string; url: string | null };
          try {
            created = await jira.createIssue({
              summary: `CI failure: ${record.content.epicKey} (${record.content.discipline}) - exit code ${exitCode}`,
              issueType: 'Bug',
              description,
              parentKey: record.content.epicKey,
            });
          } catch (error) {
            return ciFail(error);
          }

          try {
            await jira.addComment(
              record.content.epicKey,
              `AURA CI filed a defect for a failed local CI run against the ${record.content.discipline} project: ${created.key}${created.url ? ` (${created.url})` : ''}. Fix the failure described there, then ask to run CI again to retest.`,
            );
          } catch {
            // Best-effort, same as delegate_to_test's own file-defect - the defect itself is
            // already created and returned to the human regardless of whether this follow-up lands.
          }

          await draftStore.markFiled(record.id, { ...record.filed, defectFiled: 'done', defectKey: created.key });
          return {
            ok: true,
            draftId: record.id,
            epicKey: record.content.epicKey,
            discipline: record.content.discipline,
            defectKey: created.key,
            markdown: `Filed defect ${created.key}${created.url ? ` (${created.url})` : ''} for the CI failure, and commented on ${record.content.epicKey} linking to it. Once fixed, ask to run CI again to retest.`,
            provenance: buildProvenance('ci-tool', 'deterministic (no model) - see .github/workflows', record, `${record.content.epicKey} (Epic, ${record.content.discipline} project)`),
          };
        }
      }
    } catch (error) {
      return ciFail(error);
    }
  },
});
