import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Workspace layout rules (workspace/root.ts): base repos per discipline, Task worktrees as
// SIBLINGS under dev/.worktrees/<discipline>/<TASK>, AURA's local paths git-excluded. Uses real
// git in a temp directory.

const root = mkdtempSync(path.join(os.tmpdir(), 'aura-ws-'));
let mod: typeof import('./dev-workspace');

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function makeBaseRepo(epic: string, discipline: string): string {
  const dir = path.join(root, epic, 'dev', discipline);
  mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}\n');
  writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'scaffold');
  return dir;
}

beforeAll(async () => {
  vi.stubEnv('AURA_WORKSPACE_ROOT', root);
  mod = await import('./dev-workspace');
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('workspace layout', () => {
  it('uses an absolute AURA_WORKSPACE_ROOT as given', () => {
    expect(mod.devWorkspaceRoot).toBe(root);
  });

  it('puts a Task worktree beside the base repo, never inside it', () => {
    const base = path.join(root, 'KAN-1', 'dev', 'backend');
    const wt = mod.taskWorktreeDir(base, 'KAN-7');
    expect(wt).toBe(path.join(root, 'KAN-1', 'dev', '.worktrees', 'backend', 'KAN-7'));
    expect(path.relative(base, wt).startsWith('..')).toBe(true);
  });

  it('names Task branches feature/<TASK>', () => {
    expect(mod.taskBranchName('KAN-7')).toBe('feature/KAN-7');
  });
});

describe('ensureTaskWorktree', () => {
  it('creates the worktree on its own branch with node_modules linked, and is idempotent', async () => {
    const base = makeBaseRepo('KAN-2', 'backend');
    const first = await mod.ensureTaskWorktree(base, 'KAN-9');
    expect(first.created).toBe(true);
    expect(first.branch).toBe('feature/KAN-9');
    expect(git(first.workDir, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feature/KAN-9');
    expect(lstatSync(path.join(first.workDir, 'node_modules')).isSymbolicLink()).toBe(true);

    const second = await mod.ensureTaskWorktree(base, 'KAN-9');
    expect(second.created).toBe(false);
    expect(second.workDir).toBe(first.workDir);
  });

  it('leaves both the base and the worktree clean (AURA paths excluded)', async () => {
    const base = makeBaseRepo('KAN-3', 'frontend');
    const { workDir } = await mod.ensureTaskWorktree(base, 'KAN-10');
    writeFileSync(path.join(workDir, '.aura-task-prompt.txt'), 'prompt');
    mkdirSync(path.join(workDir, '.aura', 'council'), { recursive: true });
    writeFileSync(path.join(workDir, '.aura', 'council', 'x.md'), 'transcript');
    expect(git(base, 'status', '--porcelain')).toBe('');
    expect(git(workDir, 'status', '--porcelain')).toBe('');
  });

  it('writes the git excludes once, however often it is called', async () => {
    const base = makeBaseRepo('KAN-4', 'backend');
    await mod.ensureAuraExcludes(base);
    await mod.ensureAuraExcludes(base);
    const exclude = readFileSync(path.join(base, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude.match(/^\.aura\/$/gm)?.length).toBe(1);
    expect(exclude).toMatch(/^node_modules$/m);
  });
});

describe('findTaskWorktree', () => {
  it('finds a Task by key alone, across Epics and disciplines', async () => {
    const base = makeBaseRepo('KAN-5', 'backend');
    await mod.ensureTaskWorktree(base, 'KAN-11');
    const found = await mod.findTaskWorktree('KAN-11');
    expect(found).toMatchObject({ taskKey: 'KAN-11', epicKey: 'KAN-5', discipline: 'backend', branch: 'feature/KAN-11' });
  });

  it('returns null for a Task with no worktree', async () => {
    expect(await mod.findTaskWorktree('KAN-404')).toBeNull();
  });
});
