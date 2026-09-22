import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { access } from 'node:fs/promises';
import { jira } from '../../mcp/jira-client';
import { devWorkspaceDir } from '../../workspace/dev-workspace';
import { isDockerAvailable, runInContainer } from '../../lib/docker-exec';
import { draftStore } from '../../store/draft-store';
import { provenance } from './shared';
import { ciStepsToShellScript } from './dev';

// Runs an Epic's whole scaffolded project (Frontend or Backend - the checked-in CI is
// project-wide, not per-Task: devWorkspaceDir(epicKey, discipline) is the entire scaffolded
// directory every Task in that discipline shares) locally, on demand - the developer's own "does
// this pass before I push" preview, using the exact same step list
// `.github/workflows/<discipline>-ci.yaml` declares (dev.ts's CI_STEPS/ciStepsToShellScript -
// one source of truth, never two scripts that could drift). Unlike Gate 7 (delegate_to_test),
// which deliberately reports against one specific Task to close it out in Jira, a CI run and its
// defect (if any) belong to the Epic as a whole - there is no single Task that "owns" the shared
// project. `run` is deliberately not gated behind human approval: like delegate_to_git's
// `status`/`diff` ops, it only reads/builds/tests inside the ephemeral sandbox and changes
// nothing in Jira, git, or the workspace - available to whoever can use the Orchestrator at all
// (Developer included, same as the git tool), not tied to a specific approver role the way
// Gate 6/7's formal QA flow is. `file-defect` DOES write to Jira, so it is gated - but self-
// approved (no canonical agent mapping, same as git's own `commit` op). No git push, no GitHub
// API call anywhere - AURA has no GitHub integration; the developer pushes by hand and reads
// their own repo's real CI status themselves.

interface CiRunDraft {
  epicKey: string;
  discipline: 'Frontend' | 'Backend';
}

const ciInputSchema = z
  .object({
    mode: z.enum(['run', 'file-defect']),
    epicKey: z.string().optional().describe('run: the Epic whose scaffolded project to run CI against'),
    discipline: z.enum(['Frontend', 'Backend']).optional().describe('run: which scaffolded project (must already exist via delegate_to_dev)'),
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
});

function ciFail(error: unknown): z.infer<typeof ciOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export const delegateToCiTool = createTool({
  id: 'delegate_to_ci',
  description:
    "Runs an Epic's whole scaffolded project's checked-in CI (the same steps as .github/workflows/<discipline>-ci.yaml, written by Gate 4) locally, inside a sandboxed Docker container - a preview of what CI would report, before pushing anywhere. This is project-wide, not per-Task - there is no taskKey. run: epicKey + discipline -> runs immediately, no approval needed (non-mutating) - returns {ok, draftId, exitCode, markdown}; ok=false means CI failed, read error for the log tail. file-defect: draftId + approved, only after a failed run -> files a real Jira Bug under the Epic with the failure log and comments the Epic pointing to it. Only Frontend and Backend/NestJS are supported (the disciplines Gate 4 actually scaffolds) - fails clearly for anything else. Never pushes anywhere and never calls the GitHub API - AURA has no GitHub integration at all.",
  inputSchema: ciInputSchema,
  outputSchema: ciOutputSchema,
  execute: async (input, { writer, agent }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        case 'run': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const discipline = input.discipline;
          if (!epicKey || !discipline) return ciFail('run needs epicKey and discipline (Frontend or Backend)');

          const targetDir = await devWorkspaceDir(epicKey, discipline);
          try {
            await access(targetDir);
          } catch {
            return ciFail(`${discipline} under ${epicKey} has not been scaffolded yet - run delegate_to_dev for a Task in that discipline first (Gate 4)`);
          }
          if (!(await isDockerAvailable())) return ciFail('Docker is not available - install/start Docker to run CI locally');

          let result: { exitCode: number; output: string };
          try {
            result = await runInContainer({
              image: 'mcr.microsoft.com/playwright:v1.48.0-jammy',
              hostDir: targetDir,
              command: ciStepsToShellScript(discipline),
              timeoutMs: 10 * 60_000,
              name: `aura-ci-${epicKey}-${discipline}-${Date.now()}`.toLowerCase(),
              labels: { 'aura.epic': epicKey, 'aura.kind': 'ci' },
              onOutput: (chunk) => {
                void writer?.custom({ type: 'data-ci-output', data: { chunk }, transient: true });
              },
            });
          } catch (error) {
            return ciFail(error);
          }

          const content: CiRunDraft = { epicKey, discipline };
          const record = await draftStore.create({ kind: 'ci-run', content, threadId, epicKey });
          await draftStore.markFiled(record.id, { exitCode: String(result.exitCode), output: result.output.slice(-4000) });

          if (result.exitCode !== 0) {
            return {
              ok: false,
              draftId: record.id,
              epicKey,
              discipline,
              exitCode: result.exitCode,
              error: `CI failed (exit code ${result.exitCode}). Last output:\n${result.output.slice(-2000)}`,
            };
          }
          return { ok: true, draftId: record.id, epicKey, discipline, exitCode: result.exitCode, markdown: `CI passed for ${epicKey} (${discipline}).\n\n\`\`\`\n${result.output.trim().slice(-2000)}\n\`\`\`` };
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

          const stamp = provenance('CI (delegate_to_ci, local run)', 'deterministic (no model) - see .github/workflows', record, `${record.content.epicKey} (Epic, ${record.content.discipline} project)`);
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
          };
        }
      }
    } catch (error) {
      return ciFail(error);
    }
  },
});
