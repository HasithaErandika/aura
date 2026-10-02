import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GitProvider, RepoRef } from './provider';

// Behaviour every GitProvider must have (docs/plans/aura-git-control-plane.md step 1.2). Runs
// against the `local` provider in CI (local-provider.test.ts); the `github` provider runs the
// same suite against a sandbox repository.
//
// `setup` returns a provider and an EMPTY repository it can push to. `merge` stands in for the
// human merging a PR on the host (a merge commit pushed to the base branch).

export interface ContractTarget {
  provider: GitProvider;
  repo: RepoRef;
  merge: (base: string, head: string) => Promise<void>;
  close?: (number: number) => Promise<void>;
}

const IDENTITY = ['-c', 'user.name=AURA Test', '-c', 'user.email=test@aura.local'];

export function describeGitProviderContract(label: string, setup: () => Promise<ContractTarget>): void {
  describe(`GitProvider contract: ${label}`, () => {
    let t: ContractTarget;
    let work: string;
    const git = (...args: string[]) => execFileSync('git', [...IDENTITY, ...args], { cwd: work, encoding: 'utf8' }).trim();
    const commitFile = (file: string, content: string, message: string) => {
      writeFileSync(path.join(work, file), content);
      git('add', file);
      git('commit', '-q', '-m', message);
      return git('rev-parse', 'HEAD');
    };

    beforeAll(async () => {
      t = await setup();
      work = mkdtempSync(path.join(os.tmpdir(), 'aura-git-contract-'));
      git('init', '-q', '-b', t.repo.defaultBranch);
      commitFile('README.md', '# app\n', 'initial');
      git('push', '-q', await t.provider.remoteUrl(t.repo), `${t.repo.defaultBranch}:${t.repo.defaultBranch}`);
    });
    afterAll(() => rmSync(work, { recursive: true, force: true }));

    it('reads branches and returns null for a missing one', async () => {
      const main = await t.provider.getBranch(t.repo, t.repo.defaultBranch);
      expect(main?.sha).toBe(git('rev-parse', 'HEAD'));
      expect(await t.provider.getBranch(t.repo, 'feature/NOPE-1')).toBeNull();
    });

    it('creates a branch from the default branch, idempotently', async () => {
      const main = await t.provider.getBranch(t.repo, t.repo.defaultBranch);
      const created = await t.provider.createBranch(t.repo, 'feature/KAN-1');
      expect(created).toEqual({ name: 'feature/KAN-1', sha: main!.sha });
      expect(await t.provider.createBranch(t.repo, 'feature/KAN-1')).toEqual(created);
    });

    it('rejects unsafe branch names', async () => {
      for (const bad of ['-f', 'a..b', 'x y', 'feature/', '@{u}']) {
        await expect(t.provider.createBranch(t.repo, bad), bad).rejects.toThrow(/Invalid branch name/);
      }
    });

    it('pushes a branch, never forcing', async () => {
      git('fetch', '-q', await t.provider.remoteUrl(t.repo), 'feature/KAN-1');
      git('checkout', '-q', '-b', 'feature/KAN-1', 'FETCH_HEAD');
      const sha = commitFile('a.txt', 'a\n', 'feat: a');
      expect((await t.provider.push(t.repo, work, 'feature/KAN-1')).sha).toBe(sha);

      // Rewrite history locally: a non-fast-forward push must be refused.
      git('reset', '-q', '--hard', 'HEAD~1');
      commitFile('a.txt', 'rewritten\n', 'feat: a (rewritten)');
      await expect(t.provider.push(t.repo, work, 'feature/KAN-1')).rejects.toMatchObject({ code: 'conflict' });
      git('reset', '-q', '--hard', sha);
    });

    it('refuses to move an existing branch with createBranch', async () => {
      const main = await t.provider.getBranch(t.repo, t.repo.defaultBranch);
      await expect(t.provider.createBranch(t.repo, 'feature/KAN-1', main!.sha)).rejects.toMatchObject({ code: 'conflict' });
    });

    it('opens one pull request per head, and refuses an empty one', async () => {
      const pr = await t.provider.openPullRequest(t.repo, { head: 'feature/KAN-1', title: 'KAN-1', body: 'AURA run r1' });
      expect(pr).toMatchObject({ head: 'feature/KAN-1', base: t.repo.defaultBranch, state: 'open', headSha: git('rev-parse', 'HEAD') });
      const again = await t.provider.openPullRequest(t.repo, { head: 'feature/KAN-1', title: 'KAN-1 again', body: '' });
      expect(again.number).toBe(pr.number);
      expect((await t.provider.getPullRequest(t.repo, pr.number))?.title).toBe('KAN-1');

      await t.provider.createBranch(t.repo, 'feature/KAN-2');
      await expect(t.provider.openPullRequest(t.repo, { head: 'feature/KAN-2', title: 'x', body: '' })).rejects.toMatchObject({ code: 'invalid' });
    });

    it('tracks check runs on a commit', async () => {
      const headSha = git('rev-parse', 'HEAD');
      const check = await t.provider.createCheckRun(t.repo, { name: 'AURA QA', headSha, status: 'in_progress' });
      expect(check).toMatchObject({ name: 'AURA QA', headSha, status: 'in_progress', conclusion: null });
      const done = await t.provider.updateCheckRun(t.repo, check.id, { conclusion: 'success', summary: '12 passed' });
      expect(done).toMatchObject({ id: check.id, status: 'completed', conclusion: 'success', summary: '12 passed' });
    });

    it('reports clean, conflicting and merged pull requests', async () => {
      const pr = await t.provider.openPullRequest(t.repo, { head: 'feature/KAN-1', title: 'KAN-1', body: '' });
      expect(await t.provider.mergeState(t.repo, pr.number)).toBe('clean');

      // A second Task changes the same line and is merged first: KAN-1 now conflicts.
      const url = await t.provider.remoteUrl(t.repo);
      git('checkout', '-q', '-b', 'feature/KAN-3', t.repo.defaultBranch);
      commitFile('a.txt', 'three\n', 'feat: a from KAN-3');
      await t.provider.push(t.repo, work, 'feature/KAN-3');
      await t.merge(t.repo.defaultBranch, 'feature/KAN-3');
      expect(await t.provider.mergeState(t.repo, pr.number)).toBe('conflicts');

      // Resolve on the Task branch, push, merge: the PR reads as merged.
      git('checkout', '-q', 'feature/KAN-1');
      git('fetch', '-q', url, t.repo.defaultBranch);
      try {
        git('merge', '-q', 'FETCH_HEAD');
      } catch {
        writeFileSync(path.join(work, 'a.txt'), 'resolved\n');
        git('add', 'a.txt');
        git('commit', '-q', '--no-edit');
      }
      await t.provider.push(t.repo, work, 'feature/KAN-1');
      expect(await t.provider.mergeState(t.repo, pr.number)).toBe('clean');
      await t.merge(t.repo.defaultBranch, 'feature/KAN-1');
      expect((await t.provider.getPullRequest(t.repo, pr.number))?.state).toBe('merged');
      expect(await t.provider.mergeState(t.repo, pr.number)).toBe('merged');
    });

    it('returns null for an unknown pull request', async () => {
      expect(await t.provider.getPullRequest(t.repo, 9999)).toBeNull();
    });
  });
}

// A human merge for plain git remotes: merge commit on a throwaway clone, pushed to the base.
export async function mergeViaClone(remoteUrl: string, base: string, head: string): Promise<void> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aura-git-merge-'));
  try {
    const git = (...args: string[]) => execFileSync('git', [...IDENTITY, ...args], { cwd: dir, encoding: 'utf8' });
    git('clone', '-q', '--branch', base, remoteUrl, '.');
    git('fetch', '-q', 'origin', head);
    git('merge', '-q', '--no-ff', '-m', `Merge ${head}`, 'FETCH_HEAD');
    git('push', '-q', 'origin', base);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
