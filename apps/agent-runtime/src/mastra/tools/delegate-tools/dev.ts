import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { devScaffoldFiledComment, renderDevScaffoldPlan, scaffoldDisciplines, type DevScaffoldDraft } from '../../contracts/dev-drafts';
import type { ArchitectureDraft } from '../../contracts/drafts';
import { draftStore } from '../../store/draft-store';
import { jira } from '../../mcp/jira-client';
import { DEV_MODEL_ID } from '../../agents/registry';
import { generateObject, type MastraLike } from '../../lib/generate-object';
import { devWorkspaceDir, ensureAuraExcludes, ensureTaskWorktree, taskWorktreeDir, taskBranchName } from '../../workspace/dev-workspace';
import { isDockerAvailable, runInContainer } from '../../lib/docker-exec';
import { provenance, buildProvenance, disciplineFromTask, AURA_GIT_IDENTITY, type ProvenanceStamp } from './shared';
import { mkdir, writeFile, access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { untrusted, untrustedInline } from '../../gateway/untrusted';

const execFileAsync = promisify(execFile);

// One CI step list per discipline - the single source of truth both `.github/workflows/*.yaml`
// (written below, at scaffold time) and delegate_to_ci (ci.ts, run on demand) build from, so a
// local "run CI" can never drift from what the checked-in workflow file actually declares.
// Playwright specs land at these fixed paths by delegate_to_qa's file step (Gate 6) - `tests/`
// for Frontend (UI scenarios), `test/e2e/` for Backend (API scenarios).
export const CI_STEPS: Record<'Frontend' | 'Backend', { name: string; run: string }[]> = {
  Frontend: [
    { name: 'Install dependencies', run: 'npm ci' },
    { name: 'Build', run: 'npm run build' },
    { name: 'Install Playwright browsers', run: 'npx --yes playwright install --with-deps chromium' },
    {
      name: 'Start the app and run Playwright tests',
      run: ['(npm run preview -- --port 4173 --strictPort > /tmp/app.log 2>&1 &)', 'npx --yes wait-on@7 http://localhost:4173 --timeout 30000', 'npx --yes playwright test tests'].join('\n'),
    },
  ],
  Backend: [
    { name: 'Install dependencies', run: 'npm ci' },
    { name: 'Build', run: 'npm run build' },
    { name: 'Install Playwright browsers', run: 'npx --yes playwright install --with-deps chromium' },
    {
      name: 'Start the app and run Playwright tests',
      run: ['(npm run start > /tmp/app.log 2>&1 &)', 'npx --yes wait-on@7 http://localhost:4000 --timeout 30000', 'npx --yes playwright test test/e2e'].join('\n'),
    },
  ],
};

// Joins a discipline's CI steps into one set -e script so the exit code is meaningful.
export function ciStepsToShellScript(discipline: 'Frontend' | 'Backend'): string {
  return ['set -e', ...CI_STEPS[discipline].map((s) => s.run)].join('\n');
}

function renderCiWorkflow(discipline: 'Frontend' | 'Backend'): string {
  const lines: string[] = [
    `name: ${discipline} CI`,
    'on:',
    '  push:',
    '  pull_request:',
    'jobs:',
    '  build-and-test:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - uses: actions/setup-node@v4',
    '        with:',
    "          node-version: '22'",
  ];
  for (const step of CI_STEPS[discipline]) {
    lines.push(`      - name: ${step.name}`);
    const runLines = step.run.split('\n');
    if (runLines.length > 1) {
      lines.push('        run: |');
      for (const l of runLines) lines.push(`          ${l}`);
    } else {
      lines.push(`        run: ${step.run}`);
    }
  }
  return lines.join('\n') + '\n';
}

const DEFAULT_GITIGNORE = ['node_modules/', 'dist/', 'build/', '.env', 'test-results/', 'playwright-report/', ''].join('\n');

// Best-effort finishing after a scaffold: CI workflow, .gitignore and a baseline commit; never fails the scaffold.
async function finishScaffold(targetDir: string, discipline: 'Frontend' | 'Backend'): Promise<void> {
  try {
    const workflowsDir = path.join(targetDir, '.github', 'workflows');
    await mkdir(workflowsDir, { recursive: true });
    const fileName = discipline === 'Backend' ? 'backend-ci.yaml' : 'frontend-ci.yaml';
    await writeFile(path.join(workflowsDir, fileName), renderCiWorkflow(discipline), 'utf8');
  } catch {
    // Informational convenience only.
  }
  try {
    await access(path.join(targetDir, '.gitignore'));
  } catch {
    try {
      await writeFile(path.join(targetDir, '.gitignore'), DEFAULT_GITIGNORE, 'utf8');
    } catch {
      // Informational convenience only.
    }
  }
  if (discipline === 'Backend') await fixNestScaffoldTypes(targetDir);
  try {
    await execFileAsync('git', ['init'], { cwd: targetDir });
    await ensureAuraExcludes(targetDir);
    await execFileAsync('git', ['add', '-A'], { cwd: targetDir });
    await execFileAsync('git', [...AURA_GIT_IDENTITY, 'commit', '-m', `chore: initial ${discipline.toLowerCase()} scaffold (AURA Dev Agent)`], { cwd: targetDir });
  } catch {
    // Best-effort - e.g. a scaffold with nothing to commit (rare, but not fatal here).
  }
}

// Fixes the NestJS template's supertest import so a fresh scaffold typechecks.
async function fixNestScaffoldTypes(targetDir: string): Promise<void> {
  const file = path.join(targetDir, 'test', 'app.e2e-spec.ts');
  try {
    const source = await readFile(file, 'utf8');
    if (source.includes("from 'supertest/types';")) await writeFile(file, source.replace("from 'supertest/types';", "from 'supertest/types.js';"), 'utf8');
  } catch {
    // Not present in this template version - nothing to fix.
  }
}

interface ScaffoldEntry {
  image: string;
  command: string;
  description: string;
}

// Fixed scaffold commands per discipline, never chosen by a model (ADR-0001). Implemented: Frontend
// and Backend/NestJS; other disciplines fail clearly.
const SCAFFOLD_COMMANDS: Partial<Record<Exclude<(typeof scaffoldDisciplines)[number], 'Backend'>, ScaffoldEntry>> = {
  Frontend: {
    image: 'node:22-slim',
    command: 'npm create vite@latest . -- --template react-ts && npm install',
    description: 'React 19 + Vite 19 starter (npm create vite@latest, template react-ts), then npm install - the fixed frontend stack decided at Gate 3.',
  },
};

// Backend depends on the framework chosen at Gate 3 (techStack.backend on the Epic's
// architecture draft), so it is resolved separately from the fixed table above.
const BACKEND_SCAFFOLDS: Partial<Record<'Spring Boot' | 'NestJS', ScaffoldEntry>> = {
  NestJS: {
    image: 'node:22-slim',
    // node:22-slim's bundled npm crashes on install, so upgrade npm first, into a writable prefix
    // because the container runs as the host user.
    command:
      'npm config set prefix /tmp/npm-global && export PATH=/tmp/npm-global/bin:$PATH && npm install -g npm@latest @nestjs/cli --silent && nest new . --package-manager npm --skip-git --language TS',
    description: 'NestJS starter (@nestjs/cli new), TypeScript, npm - the backend framework chosen at Gate 3.',
  },
};

// The fixed scaffold for a discipline; returns an error string, never throws.
async function resolveScaffold(discipline: (typeof scaffoldDisciplines)[number], epicKey: string): Promise<{ entry: ScaffoldEntry } | { error: string }> {
  if (discipline === 'Backend') {
    // Must be the latest *filed* architecture draft, not merely the latest created one - an
    // unapproved draft/revise attempt (rejected, never filed) still gets its own row here, and
    // would otherwise silently outrank the real, already-filed design that created this Task in
    // the first place (principle 5: what's actually built wins over what was last proposed).
    const candidates = await draftStore.listByEpic<ArchitectureDraft>('architecture', epicKey, 20);
    const archDraft = candidates.find((r) => r.filed.workspaceWritten);
    const backend = archDraft?.content.techStack.backend;
    const entry = backend ? BACKEND_SCAFFOLDS[backend as 'Spring Boot' | 'NestJS'] : undefined;
    if (!entry) return { error: `No scaffold is implemented for Backend/${backend ?? 'unknown'} yet - see docs/adr/0001-dev-agent-scaffold-and-template-strategy.md` };
    return { entry };
  }
  const entry = SCAFFOLD_COMMANDS[discipline];
  if (!entry) return { error: `No scaffold is implemented for ${discipline} yet - see docs/adr/0001-dev-agent-scaffold-and-template-strategy.md` };
  return { entry };
}

const devInputSchema = z
  .object({
    mode: z.enum(['draft', 'execute']),
    epicKey: z.string().optional().describe('draft: the Epic this Task belongs to'),
    taskKey: z.string().optional().describe('draft: the Jira Task key to scaffold (an approved architecture Task)'),
    draftId: z.string().optional().describe('execute: the draftId returned by draft'),
    approved: z.boolean().optional().describe('execute: must be true; set only after ask_user returned an approval'),
  })
  .strict();

const devOutputSchema = z.object({
  ok: z.boolean().describe('false means the step failed; read error, tell the user, and stop.'),
  draftId: z.string().optional(),
  markdown: z.string().optional().describe('Human-readable draft. Show it to the user verbatim.'),
  epicKey: z.string().optional(),
  taskKey: z.string().optional(),
  targetDir: z.string().optional(),
  exitCode: z.number().optional(),
  error: z.string().optional(),
  provenance: z.custom<ProvenanceStamp>().optional(),
});

function devFail(error: unknown): z.infer<typeof devOutputSchema> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export const delegateToDevTool = createTool({
  id: 'delegate_to_dev',
  description:
    "Dev Agent. draft: epicKey + taskKey -> reads the Task's discipline and a scaffold plan for it (Frontend and Backend/NestJS implemented; others fail clearly - returns draftId + markdown). execute: draftId + approved -> runs the fixed scaffold command in a sandboxed Docker container, moves the Task to In Progress, and comments the result (returns targetDir + exitCode). Never execute without an explicit human approval.",
  inputSchema: devInputSchema,
  outputSchema: devOutputSchema,
  execute: async (input, { mastra, agent, writer }) => {
    const threadId = agent?.threadId ?? null;
    try {
      switch (input.mode) {
        // Builds the plan: picks the (fixed) command for the Task's discipline and asks the
        // Dev agent for a short explanation. Chooses no command itself beyond the lookup.
        case 'draft': {
          const epicKey = input.epicKey?.trim().toUpperCase();
          const taskKey = input.taskKey?.trim().toUpperCase();
          if (!epicKey || !taskKey) return devFail('draft needs both epicKey and taskKey');
          const task = await jira.getIssue(taskKey);
          if (task.issueType && task.issueType.toLowerCase() !== 'task') return devFail(`${taskKey} is a ${task.issueType}, not a Task`);

          const discipline = disciplineFromTask(task.description || '');
          if (!discipline) return devFail(`Could not read a discipline off ${taskKey} - it should carry "**Discipline:** <name>" (delegate_to_architect's filed Tasks always do)`);

          const resolved = await resolveScaffold(discipline, epicKey);
          if ('error' in resolved) return devFail(resolved.error);
          const scaffold = resolved.entry;

          // The base repo is shared by every Task of this discipline in the Epic - check whether
          // an earlier Task already scaffolded it before proposing the scaffold command again.
          // This is the actual fix for re-running `npm create vite@latest` on top of another
          // Task's already-scaffolded (or already in-progress) directory: a second Task only
          // ever gets its own isolated worktree, never a second scaffold.
          const baseDir = await devWorkspaceDir(epicKey, discipline);
          let alreadyScaffolded = false;
          try {
            alreadyScaffolded = (await readdir(baseDir)).length > 0;
          } catch {
            alreadyScaffolded = false;
          }
          // Always this Task's own worktree path, even before it exists - execute() creates it
          // (via ensureTaskWorktree) whether or not the base itself needed scaffolding first, so
          // this is the one path every downstream tool (Coding Agent, Git tool, Tester Agent)
          // will resolve to for this Task from here on.
          const targetDir = taskWorktreeDir(baseDir, taskKey);
          const branch = taskBranchName(taskKey);

          const prompt = `Task ${taskKey}: ${untrustedInline(`jira:${taskKey} summary`, task.summary)}\n\n${untrusted(`jira:${taskKey} description`, task.description)}\n\nDiscipline: ${discipline}\n${
            alreadyScaffolded ? `${discipline} is already scaffolded at ${baseDir} - this Task only gets its own isolated git worktree.` : `Will run: ${scaffold.description}`
          }\nThis Task's own directory: ${targetDir}\n\nReturn only the JSON the schema describes.`;
          const { summary } = await generateObject(mastra as MastraLike, 'dev', prompt, z.object({ summary: z.string().min(10) }));

          const content: DevScaffoldDraft = {
            epicKey,
            taskKey,
            discipline,
            baseDir,
            targetDir,
            branch,
            alreadyScaffolded,
            image: scaffold.image,
            command: scaffold.command,
            commandDescription: scaffold.description,
            summary,
          };
          const record = await draftStore.create({ kind: 'dev-scaffold', content, threadId, epicKey });
          return { ok: true, draftId: record.id, markdown: renderDevScaffoldPlan(content), epicKey, taskKey };
        }
        // Runs the fixed command for the drafted discipline inside a sandboxed container, then
        // comments the result on the Task. Idempotent: a draft already executed just reports
        // its prior result instead of running again.
        case 'execute': {
          if (!input.draftId) return devFail('execute needs draftId');
          if (input.approved !== true) return devFail('execute requires approved=true, which is only set after the human approved via ask_user');
          const record = await draftStore.get<DevScaffoldDraft>(input.draftId);
          if (!record || record.kind !== 'dev-scaffold') return devFail(`unknown dev scaffold draft ${input.draftId}`);

          if (record.filed.status === 'done') {
            return {
              ok: true,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              targetDir: record.content.targetDir,
              exitCode: Number(record.filed.exitCode ?? '0'),
              markdown: `Already scaffolded (exit code ${record.filed.exitCode ?? '0'}). Nothing was run twice.`,
            };
          }

          if (!(await isDockerAvailable())) return devFail('Docker is not available - install/start Docker to run scaffolds (docs/adr/0001-dev-agent-scaffold-and-template-strategy.md)');

          // Marks the Task "In Progress" as work starts - best-effort, since Jira's own
          // workflow may not have a transition of that exact name, and a missing status move
          // must never block the scaffold itself from running.
          try {
            const transitions = await jira.getTransitions(record.content.taskKey);
            const inProgress = transitions.find((t) => t.name.toLowerCase() === 'in progress');
            if (inProgress) await jira.transitionIssue(record.content.taskKey, inProgress.id);
          } catch {
            // Best-effort; proceed regardless.
          }

          // Already scaffolded: this Task only gets its own worktree off the base repo.
          if (record.content.alreadyScaffolded) {
            const worktree = await ensureTaskWorktree(record.content.baseDir, record.content.taskKey);
            await draftStore.markFiled(record.id, { status: 'done', exitCode: '0' });
            const stamp = provenance('dev-agent', DEV_MODEL_ID, record, `${record.content.taskKey} (Task)`);
            try {
              await jira.addComment(record.content.taskKey, devScaffoldFiledComment(record.content, 0, '', stamp));
            } catch {
              // The comment is informational; the worktree on disk is what matters.
            }
            return {
              ok: true,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              targetDir: worktree.workDir,
              exitCode: 0,
              markdown: `${record.content.discipline} was already scaffolded at ${record.content.baseDir}. This Task now has its own isolated git worktree at ${worktree.workDir} on branch \`${worktree.branch}\` - nothing was re-scaffolded, and other Tasks' worktrees are untouched.`,
              provenance: buildProvenance('dev-agent', DEV_MODEL_ID, record, `${record.content.taskKey} (Task)`),
            };
          }

          let result: { exitCode: number; output: string };
          try {
            result = await runInContainer({
              image: record.content.image,
              hostDir: record.content.baseDir,
              command: record.content.command,
              timeoutMs: 5 * 60_000,
              name: `aura-dev-${record.id}`,
              labels: { 'aura.epic': record.content.epicKey, 'aura.task': record.content.taskKey, 'aura.kind': 'dev-scaffold' },
              onOutput: (chunk) => {
                void writer?.custom({ type: 'data-dev-output', data: { chunk }, transient: true });
              },
            });
          } catch (error) {
            return devFail(error);
          }

          if (result.exitCode !== 0) {
            await draftStore.markFiled(record.id, { status: 'done', exitCode: String(result.exitCode) });
            const stamp = provenance('dev-agent', DEV_MODEL_ID, record, `${record.content.taskKey} (Task)`);
            try {
              await jira.addComment(record.content.taskKey, devScaffoldFiledComment(record.content, result.exitCode, result.output, stamp));
            } catch {
              // Best-effort.
            }
            return {
              ok: false,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              exitCode: result.exitCode,
              error: `Scaffold failed (exit code ${result.exitCode}). Last output:\n${result.output.slice(-2000)}`,
            };
          }

          // Finish the base scaffold before branching the first worktree, so it inherits the baseline commit.
          if (record.content.discipline === 'Frontend' || record.content.discipline === 'Backend') {
            await finishScaffold(record.content.baseDir, record.content.discipline);
          }
          const worktree = await ensureTaskWorktree(record.content.baseDir, record.content.taskKey);

          await draftStore.markFiled(record.id, { status: 'done', exitCode: String(result.exitCode) });
          const stamp = provenance('dev-agent', DEV_MODEL_ID, record, `${record.content.taskKey} (Task)`);
          try {
            await jira.addComment(record.content.taskKey, devScaffoldFiledComment(record.content, result.exitCode, result.output, stamp));
          } catch {
            // The comment is informational; the scaffold on disk is what matters.
          }

          return {
            ok: true,
            draftId: record.id,
            epicKey: record.content.epicKey,
            taskKey: record.content.taskKey,
            targetDir: worktree.workDir,
            exitCode: result.exitCode,
            markdown: `Scaffold complete at ${record.content.baseDir}. A CI workflow (.github/workflows/${record.content.discipline === 'Backend' ? 'backend' : 'frontend'}-ci.yaml) and a local git repo (git init) were also set up. This Task's own isolated worktree is at ${worktree.workDir} on branch \`${worktree.branch}\` - work happens there, not in the base repo. No remote, no push; that stays yours to do by hand.`,
            provenance: buildProvenance('dev-agent', DEV_MODEL_ID, record, `${record.content.taskKey} (Task)`),
          };
        }
      }
    } catch (error) {
      return devFail(error);
    }
  },
});
