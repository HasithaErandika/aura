import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { BridgeCaller } from '../bridge/client';
import { addWorktree, commitWorktree, concludeMerge, ensureTaskBranch, gitOn, mergeBranch, removeWorktree } from './git-ops';
import { collectChange } from './workspace-ops';

// The git steps against a real repository, through a bridge that runs commands in a temp folder
// (the extension's executor does the same on the developer's machine).

const root = mkdtempSync(join(tmpdir(), 'aura-git-ops-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const sh = (command: string, cwd = root) => execSync(command, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const bridge: BridgeCaller = {
  async call(op, args) {
    const a = args as Record<string, unknown>;
    if (op === 'sandbox.exec') {
      try {
        return { exitCode: 0, stdout: sh(String(a.command), join(root, String(a.cwd ?? '.'))), stderr: '', timedOut: false, executionTimeMs: 1, stdoutTruncated: false, stderrTruncated: false } as never;
      } catch (error) {
        const e = error as { status?: number; stdout?: string; stderr?: string };
        return { exitCode: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '', timedOut: false, executionTimeMs: 1, stdoutTruncated: false, stderrTruncated: false } as never;
      }
    }
    const path = join(root, String(a.path));
    if (op === 'fs.mkdir') return void mkdirSync(path, { recursive: true }) as never;
    if (op === 'fs.writeFile') {
      mkdirSync(dirname(path), { recursive: true });
      return void writeFileSync(path, String(a.content)) as never;
    }
    if (op === 'fs.exists') return { exists: existsSync(path) } as never;
    if (op === 'fs.readFile') return { content: readFileSync(path, 'utf8'), encoding: 'utf8' } as never;
    throw new Error(`unexpected ${op}`);
  },
};

describe('git steps on a real repository', () => {
  it('runs a two-part Task as _s1 + _s2, merges both and resolves a conflict', async () => {
    sh('git init -q -b main && git config user.email a@b.c && git config user.name AURA && git config commit.gpgsign false');
    writeFileSync(join(root, 'shared.txt'), 'one\n');
    sh('git add -A && git commit -q -m init && git branch development');
    const git = gitOn(bridge);

    const { base, created } = await ensureTaskBranch(git, 'feat/KAN-36/KAN-45');
    expect(created).toBe(true);
    expect(sh('git rev-parse --abbrev-ref HEAD').trim()).toBe('feat/KAN-36/KAN-45');

    await addWorktree(git, bridge, 'KAN-45_s1', 'feat/KAN-36/KAN-45_s1', 'feat/KAN-36/KAN-45');
    await addWorktree(git, bridge, 'KAN-45_s2', 'feat/KAN-36/KAN-45_s2', 'feat/KAN-36/KAN-45');
    expect(sh('git status --porcelain').trim()).toBe('');

    mkdirSync(join(root, '.aura/worktrees/KAN-45_s1/api'), { recursive: true });
    writeFileSync(join(root, '.aura/worktrees/KAN-45_s1/api/tickets.ts'), 'export const api = 1;\n');
    writeFileSync(join(root, '.aura/worktrees/KAN-45_s1/shared.txt'), 'one\napi\n');
    mkdirSync(join(root, '.aura/worktrees/KAN-45_s2/web'), { recursive: true });
    writeFileSync(join(root, '.aura/worktrees/KAN-45_s2/web/List.tsx'), 'export const List = 1;\n');
    writeFileSync(join(root, '.aura/worktrees/KAN-45_s2/shared.txt'), 'one\nweb\n');

    expect(await commitWorktree(git, 'KAN-45_s1', 'feat(KAN-45): "API" part')).toBe(true);
    expect(await commitWorktree(git, 'KAN-45_s2', 'feat(KAN-45): page part')).toBe(true);

    expect(await mergeBranch(git, 'feat/KAN-36/KAN-45_s1', 'Merge part 1')).toEqual({ clean: true });
    await removeWorktree(git, 'KAN-45_s1', 'feat/KAN-36/KAN-45_s1');
    const second = await mergeBranch(git, 'feat/KAN-36/KAN-45_s2', 'Merge part 2');
    expect(second).toEqual({ clean: false, conflicts: ['shared.txt'] });
    writeFileSync(join(root, 'shared.txt'), 'one\napi\nweb\n');
    await concludeMerge(git, ['shared.txt']);
    await removeWorktree(git, 'KAN-45_s2', 'feat/KAN-36/KAN-45_s2');

    expect(sh('git branch --list "feat/*"').replace(/[ *]/g, '').trim().split('\n')).toEqual(['feat/KAN-36/KAN-45']);
    expect(existsSync(join(root, '.aura/worktrees/KAN-45_s1'))).toBe(false);
    const change = await collectChange(bridge, base);
    expect(change.files.map((f) => `${f.status} ${f.path}`).sort()).toEqual(['added api/tickets.ts', 'added web/List.tsx', 'modified shared.txt']);
  });

  it('refuses to switch branch over uncommitted work', async () => {
    sh('git checkout -q development');
    writeFileSync(join(root, 'shared.txt'), 'dirty\n');
    await expect(ensureTaskBranch(gitOn(bridge), 'feat/KAN-46')).rejects.toThrow(/uncommitted/);
  });
});
