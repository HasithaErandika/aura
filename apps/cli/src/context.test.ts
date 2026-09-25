import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeTaskKey, resolveTask, taskFromCwd } from './context.js';

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function repoOnBranch(branch: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aura-ctx-'));
  dirs.push(dir);
  execFileSync('git', ['init', '-q', '-b', branch], { cwd: dir });
  return dir;
}

describe('Task keys', () => {
  it('normalizes and validates Jira keys', () => {
    expect(normalizeTaskKey(' kan-45 ')).toBe('KAN-45');
    expect(() => normalizeTaskKey('45')).toThrow(/Jira issue key/);
    expect(() => normalizeTaskKey('KAN_45')).toThrow();
  });

  it('reads the Task from a feature/<TASK> worktree branch', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(repoOnBranch('feature/KAN-47'));
      expect(await taskFromCwd()).toBe('KAN-47');
      expect(await resolveTask(undefined)).toBe('KAN-47');
      expect(await resolveTask('kan-9')).toBe('KAN-9');
    } finally {
      process.chdir(cwd);
    }
  });

  it('refuses to guess outside a Task worktree', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(repoOnBranch('main'));
      expect(await taskFromCwd()).toBeNull();
      await expect(resolveTask(undefined)).rejects.toThrow(/No Task given/);
    } finally {
      process.chdir(cwd);
    }
  });
});
