import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { devScaffoldFiledComment, renderDevScaffoldPlan, scaffoldDisciplines, type DevScaffoldDraft } from '../../contracts/dev-drafts';
import type { ArchitectureDraft } from '../../contracts/drafts';
import { draftStore } from '../../store/draft-store';
import { jira } from '../../mcp/jira-client';
import { DEV_MODEL_ID } from '../../agents/registry';
import { generateObject, type MastraLike } from '../../lib/generate-object';
import { devWorkspaceDir } from '../../workspace/dev-workspace';
import { isDockerAvailable, runInContainer } from '../../lib/docker-exec';
import { provenance, buildProvenance, disciplineFromTask, AURA_GIT_IDENTITY, type ProvenanceStamp } from './shared';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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

// Joins a discipline's CI_STEPS into one shell script for delegate_to_ci to run locally in a
// single container - `set -e` makes any failing step abort the script (matching a normal CI
// job's own "any step fails -> job fails" semantics) so the container's own exit code is
// meaningful.
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

// Best-effort, non-blocking finishing touches after a real scaffold succeeds: the CI workflow
// file (so `.github/workflows/<discipline>-ci.yaml` exists from the start, not bolted on later),
// a `.gitignore` if the scaffold tool didn't already write one (NestJS's `--skip-git` skips it
// too), and an initial "chore: scaffold" commit. Committing here, not just `git init`, matters:
// without a baseline commit, `git diff`/`status` (delegate_to_git's read ops) show every file in
// the scaffold as untracked once the Coding Agent (Gate 5) starts editing, so there is no way to
// see what it actually changed versus what the scaffold tool generated. A committed baseline
// makes that diff real. The human still owns every commit *after* this one, via the gated
// delegate_to_git `commit` op. None of this touches Jira, and none of it can fail the scaffold
// itself - a problem here is swallowed, never surfacing as a Gate 4 failure, since the scaffold
// on disk is what actually matters.
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
  try {
    await execFileAsync('git', ['init'], { cwd: targetDir });
    await execFileAsync('git', ['add', '-A'], { cwd: targetDir });
    await execFileAsync('git', [...AURA_GIT_IDENTITY, 'commit', '-m', `chore: initial ${discipline.toLowerCase()} scaffold (AURA Dev Agent)`], { cwd: targetDir });
  } catch {
    // Best-effort - e.g. a scaffold with nothing to commit (rare, but not fatal here).
  }
}

interface ScaffoldEntry {
  image: string;
  command: string;
  description: string;
}

// Fixed, code-defined scaffold commands per discipline - never chosen or written by a model
// (docs/adr/0001-dev-agent-scaffold-and-template-strategy.md). Verified working (real Docker
// run, exit 0, files on disk): Frontend, Backend/NestJS. Not yet implemented - each fails
// clearly rather than silently doing nothing when asked for: Backend/Spring Boot (needs a JDK
// image and Spring Initializr network access, neither exercised yet), Data (the ADR's open
// sub-decision on Postgres provisioning is still open), AI, Integration, and "Security" (not a
// discipline architecture Tasks carry at all - security is the Architect's securityDesign
// section, implemented as part of whichever Task addresses it, not a separate scaffold; ask if
// something more specific is meant here before one is invented).
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
    // Root cause of the "Cannot read properties of null (reading 'edgesOut')" crash: it's
    // node:22-slim's bundled npm 10.9.8 arborist itself - reproduces on a plain `npm install`
    // in a freshly scaffolded project, npx not involved. Fixed by upgrading npm before
    // scaffolding. The container runs as the host UID (docker-exec.ts), so a plain
    // `npm install -g` would fail with EACCES against the root-owned default prefix
    // (/usr/local/lib/node_modules) - point the global prefix at a writable path first.
    // Verified with two real Docker runs, exit 0, dependencies installed, files on disk.
    command:
      'npm config set prefix /tmp/npm-global && export PATH=/tmp/npm-global/bin:$PATH && npm install -g npm@latest @nestjs/cli --silent && nest new . --package-manager npm --skip-git --language TS',
    description: 'NestJS starter (@nestjs/cli new), TypeScript, npm - the backend framework chosen at Gate 3.',
  },
};

// Resolves the fixed scaffold for a Task's discipline, reading the Epic's stored tech-stack
// choice for Backend. Returns an error string, never throws - draft mode turns it into a
// plain devFail() the same way any other input problem is reported.
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

          const targetDir = await devWorkspaceDir(epicKey, discipline);
          const prompt = `Task ${taskKey}: ${task.summary}\n\n${task.description || '(no description)'}\n\nDiscipline: ${discipline}\nWill run: ${scaffold.description}\nTarget directory: ${targetDir}\n\nReturn only the JSON the schema describes.`;
          const { summary } = await generateObject(mastra as MastraLike, 'dev', prompt, z.object({ summary: z.string().min(10) }));

          const content: DevScaffoldDraft = {
            epicKey,
            taskKey,
            discipline,
            targetDir,
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

          let result: { exitCode: number; output: string };
          try {
            result = await runInContainer({
              image: record.content.image,
              hostDir: record.content.targetDir,
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

          await draftStore.markFiled(record.id, { status: 'done', exitCode: String(result.exitCode) });
          const stamp = provenance('dev-agent', DEV_MODEL_ID, record, `${record.content.taskKey} (Task)`);
          try {
            await jira.addComment(record.content.taskKey, devScaffoldFiledComment(record.content, result.exitCode, result.output, stamp));
          } catch {
            // The comment is informational; the scaffold on disk is what matters.
          }

          if (result.exitCode !== 0) {
            return {
              ok: false,
              draftId: record.id,
              epicKey: record.content.epicKey,
              taskKey: record.content.taskKey,
              exitCode: result.exitCode,
              error: `Scaffold failed (exit code ${result.exitCode}). Last output:\n${result.output.slice(-2000)}`,
            };
          }

          if (record.content.discipline === 'Frontend' || record.content.discipline === 'Backend') {
            await finishScaffold(record.content.targetDir, record.content.discipline);
          }

          return {
            ok: true,
            draftId: record.id,
            epicKey: record.content.epicKey,
            taskKey: record.content.taskKey,
            targetDir: record.content.targetDir,
            exitCode: result.exitCode,
            markdown: `Scaffold complete at ${record.content.targetDir}. A CI workflow (.github/workflows/${record.content.discipline === 'Backend' ? 'backend' : 'frontend'}-ci.yaml) and a local git repo (git init) were also set up - no remote, no push; that stays yours to do by hand.`,
            provenance: buildProvenance('dev-agent', DEV_MODEL_ID, record, `${record.content.taskKey} (Task)`),
          };
        }
      }
    } catch (error) {
      return devFail(error);
    }
  },
});
