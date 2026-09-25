import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { availableChecks, ensureTaskDependencies, listActiveChecks, runCheck } from './sandbox';

// Checks are fixed ids resolved from the project's own package.json - never argv from a model.

const dirs: string[] = [];
function project(scripts: Record<string, string>, extra: { dependencies?: Record<string, string> } = {}): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aura-sbx-'));
  dirs.push(dir);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'p', scripts, ...extra }));
  return dir;
}
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('availableChecks', () => {
  it('maps package scripts to fixed npm argv', async () => {
    const checks = await availableChecks(project({ typecheck: 'tsc', build: 'x', test: 'vitest run', lint: 'eslint .' }));
    expect(checks.map((c) => c.id)).toEqual(['typecheck', 'build', 'test', 'lint']);
    expect(checks.find((c) => c.id === 'test')?.argv).toEqual(['npm', 'run', 'test', '--silent']);
  });

  it('ignores npm init\'s placeholder test script', async () => {
    const checks = await availableChecks(project({ test: 'echo "Error: no test specified" && exit 1' }));
    expect(checks).toEqual([]);
  });

  it('returns nothing for a directory without package.json', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'aura-sbx-'));
    dirs.push(dir);
    expect(await availableChecks(dir)).toEqual([]);
  });
});

describe('runCheck (host)', () => {
  it('reports a passing check', async () => {
    const result = await runCheck(project({ test: 'node -e "console.log(\'ok\')"' }), 'test');
    expect(result.ok).toBe(true);
    expect(result.output).toContain('ok');
  });

  it('reports a failing check with its exit code', async () => {
    const result = await runCheck(project({ test: 'node -e "process.exit(3)"' }), 'test');
    expect(result.ok).toBe(false);
    expect(result.output).toContain('exit code');
  });

  it('skips a check the project does not define, as passing', async () => {
    const result = await runCheck(project({}), 'lint');
    expect(result.ok).toBe(true);
    expect(result.output).toContain('skipped');
  });

  it('does not pass AURA secrets into project scripts', async () => {
    process.env.GROQ_API_KEY = 'must-not-leak';
    const result = await runCheck(project({ test: 'node -e "console.log(process.env.GROQ_API_KEY ?? \'absent\')"' }), 'test');
    delete process.env.GROQ_API_KEY;
    expect(result.output).toContain('absent');
  });

  it('forgets a check once it has finished', async () => {
    await runCheck(project({ test: 'node -e ""' }), 'test');
    expect(listActiveChecks()).toEqual([]);
  });
});

describe('ensureTaskDependencies', () => {
  it('does nothing for a repo with a real node_modules', async () => {
    const dir = project({});
    mkdirSync(path.join(dir, 'node_modules'));
    expect(await ensureTaskDependencies(dir)).toBeNull();
  });

  it('keeps the shared node_modules while the Task has not changed dependencies', async () => {
    const base = project({}, { dependencies: { a: '1.0.0' } });
    mkdirSync(path.join(base, 'node_modules'));
    const task = project({}, { dependencies: { a: '1.0.0' } });
    symlinkSync(path.join(base, 'node_modules'), path.join(task, 'node_modules'), 'dir');
    expect(await ensureTaskDependencies(task)).toBeNull();
  });
});
