import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalGitProvider } from './local-provider';
import { describeGitProviderContract, mergeViaClone } from './provider.contract';
import type { RepoRef } from './provider';

const root = mkdtempSync(path.join(os.tmpdir(), 'aura-git-local-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const repo: RepoRef = { provider: 'local', owner: 'acme', name: 'shop', defaultBranch: 'main' };

describeGitProviderContract('local', async () => {
  const provider = new LocalGitProvider(root);
  await provider.ensureRepository(repo);
  return {
    provider,
    repo,
    merge: (base, head) => mergeViaClone(provider.repoDir(repo), base, head),
  };
});

describe('LocalGitProvider', () => {
  const provider = new LocalGitProvider(root);

  it('keeps repositories under the root, one bare repo per owner/name', async () => {
    const other: RepoRef = { ...repo, name: 'web' };
    const dir = await provider.ensureRepository(other);
    expect(dir).toBe(path.join(root, 'acme', 'web.git'));
    expect(existsSync(path.join(dir, 'HEAD'))).toBe(true);
    expect(await provider.ensureRepository(other)).toBe(dir);
  });

  it('refuses owner and name values that would leave the root', () => {
    for (const [owner, name] of [['..', 'x'], ['acme', '..'], ['a/b', 'x'], ['acme', 'x/y']]) {
      expect(() => provider.repoDir({ ...repo, owner, name }), `${owner}/${name}`).toThrow(/Invalid repository/);
    }
  });

  it('reports a missing default branch instead of branching from nothing', async () => {
    const empty: RepoRef = { ...repo, name: 'empty' };
    await provider.ensureRepository(empty);
    await expect(provider.createBranch(empty, 'feature/KAN-9')).rejects.toMatchObject({ code: 'not_found' });
  });
});
