import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { runInContainer } from './docker-exec';

// Project checks (typecheck/build/test/lint) the Coding Council may run against a Task's
// worktree (docs/plans/aura-code-cli-council.md section 4.6). The model only ever picks a check
// *id*; the argv behind each id is fixed here and resolved from the project's own package.json,
// never from model output. Commands run via execFile (no shell) with the worktree as cwd, a
// stripped environment, a timeout, and capped output.
//
// SANDBOX_MODE=host (default) runs them directly on this machine - no Docker needed, which is the
// point of the council's design. SANDBOX_MODE=docker runs the same ids through the existing
// runInContainer sandbox instead. Accepted residual risk in host mode: `npm run test` executes the
// project's own scripts, which the Implementer can edit - acceptable for AURA's local, single-user
// deployment, not for hosted use (set SANDBOX_MODE=docker there).
//
// There is deliberately no `install` check: a Task worktree's node_modules is a symlink to the
// discipline's shared base repo (workspace/dev-workspace.ts), so installing from one Task would
// change every other Task's dependencies underneath them.

export const CHECK_IDS = ['typecheck', 'build', 'test', 'lint'] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export const SANDBOX_MODE: 'host' | 'docker' = process.env.SANDBOX_MODE === 'docker' ? 'docker' : 'host';

const TIMEOUT_MS: Record<CheckId, number> = { typecheck: 3 * 60_000, build: 5 * 60_000, test: 5 * 60_000, lint: 3 * 60_000 };
const OUTPUT_CAP = 20_000;
const DOCKER_IMAGE = 'node:22-slim';

export interface ResolvedCheck {
  id: CheckId;
  // Program + args relative to the worktree - e.g. ['npm', 'run', 'test', '--silent'].
  argv: string[];
}

export interface CheckResult {
  id: CheckId;
  ok: boolean;
  output: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function packageScripts(dir: string): Promise<Record<string, string>> {
  try {
    const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

// npm init's placeholder test script fails on purpose; treat it as "no tests".
function isPlaceholderTest(script: string): boolean {
  return /no test specified/i.test(script);
}

// Which checks this project actually supports, and the fixed argv for each.
export async function availableChecks(dir: string): Promise<ResolvedCheck[]> {
  const scripts = await packageScripts(dir);
  const checks: ResolvedCheck[] = [];
  if (scripts.typecheck) checks.push({ id: 'typecheck', argv: ['npm', 'run', 'typecheck', '--silent'] });
  else if ((await exists(path.join(dir, 'tsconfig.json'))) && (await exists(path.join(dir, 'node_modules', '.bin', 'tsc')))) {
    checks.push({ id: 'typecheck', argv: ['node_modules/.bin/tsc', '--noEmit', '-p', 'tsconfig.json'] });
  }
  if (scripts.build) checks.push({ id: 'build', argv: ['npm', 'run', 'build', '--silent'] });
  if (scripts.test && !isPlaceholderTest(scripts.test)) checks.push({ id: 'test', argv: ['npm', 'run', 'test', '--silent'] });
  if (scripts.lint) checks.push({ id: 'lint', argv: ['npm', 'run', 'lint', '--silent'] });
  return checks;
}

function cap(text: string): string {
  return text.length > OUTPUT_CAP ? `…(truncated)\n${text.slice(-OUTPUT_CAP)}` : text;
}

function runOnHost(dir: string, check: ResolvedCheck): Promise<CheckResult> {
  const [program, ...args] = check.argv as [string, ...string[]];
  // Only what a Node toolchain needs. No API keys, tokens, or AURA configuration leak into
  // project scripts. CI=1 keeps test runners (vitest, jest) out of watch mode.
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? dir, CI: '1', FORCE_COLOR: '0', LANG: process.env.LANG ?? 'C.UTF-8' };
  return new Promise((resolve) => {
    execFile(program, args, { cwd: dir, env, timeout: TIMEOUT_MS[check.id], maxBuffer: 16 * 1024 * 1024, killSignal: 'SIGKILL' }, (error, stdout, stderr) => {
      const output = cap(`${stdout}${stderr}`.trim());
      if (!error) return resolve({ id: check.id, ok: true, output });
      const reason = error.killed ? `timed out after ${Math.round(TIMEOUT_MS[check.id] / 1000)}s` : `exit code ${typeof error.code === 'number' ? error.code : String(error.code)}`;
      resolve({ id: check.id, ok: false, output: cap(`${output}\n[${check.id} failed: ${reason}]`.trim()) });
    });
  });
}

async function runInDocker(dir: string, check: ResolvedCheck): Promise<CheckResult> {
  // argv entries come only from the fixed table above, never from a model - joining them into
  // the container's `sh -c` string is safe for the same reason docker-exec.ts's commands are.
  const result = await runInContainer({ image: DOCKER_IMAGE, hostDir: dir, command: check.argv.join(' '), timeoutMs: TIMEOUT_MS[check.id], env: { CI: '1' } });
  return { id: check.id, ok: result.exitCode === 0, output: cap(result.output.trim()) };
}

// Checks running right now, for the Runners view (server/runners-routes.ts). Observational only.
export interface ActiveCheck {
  key: string;
  id: CheckId;
  dir: string;
  argv: string[];
  mode: 'host' | 'docker';
  startedAt: string;
}
const activeChecks = new Map<string, ActiveCheck>();
let checkSeq = 0;

export function listActiveChecks(): ActiveCheck[] {
  return [...activeChecks.values()];
}

export async function runCheck(dir: string, id: CheckId): Promise<CheckResult> {
  const check = (await availableChecks(dir)).find((c) => c.id === id);
  if (!check) return { id, ok: true, output: `(no ${id} step in this project - skipped)` };
  const key = `check-${++checkSeq}`;
  activeChecks.set(key, { key, id, dir, argv: check.argv, mode: SANDBOX_MODE, startedAt: new Date().toISOString() });
  try {
    return SANDBOX_MODE === 'docker' ? await runInDocker(dir, check) : await runOnHost(dir, check);
  } catch (error) {
    return { id, ok: false, output: error instanceof Error ? error.message : String(error) };
  } finally {
    activeChecks.delete(key);
  }
}

// Runs every check the project supports, in a fixed order, stopping at the first failure - a
// failing typecheck makes the build/test output after it noise.
export async function runAllChecks(dir: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of await availableChecks(dir)) {
    const result = await runCheck(dir, check.id);
    results.push(result);
    if (!result.ok) break;
  }
  return results;
}
