import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { APPROVER_CONTEXT_KEY, approverFrom, commitArgs, type Approver } from './shared';

// Server-side commits are authored by the human who approved them when their profile has a git
// identity, and by AURA otherwise - AURA is always the committer (ADR-3).

const context = (value: unknown) => ({ get: (key: string) => (key === APPROVER_CONTEXT_KEY ? value : undefined) });

const withGit: Approver = { userId: 'u1', role: 'developer', name: 'Dana Dev', email: 'dana@example.com', gitName: 'Dana D', gitEmail: 'dana@users.noreply.github.com' };
const withoutGit: Approver = { ...withGit, gitName: null, gitEmail: null };

describe('approverFrom', () => {
  it('reads the approver the API sent', () => {
    expect(approverFrom(context(withGit))).toEqual(withGit);
  });

  it('returns null when missing or malformed', () => {
    expect(approverFrom(undefined)).toBeNull();
    expect(approverFrom(context(undefined))).toBeNull();
    expect(approverFrom(context({ name: 'no user id' }))).toBeNull();
  });

  it('treats blank git fields as unset', () => {
    expect(approverFrom(context({ ...withGit, gitName: '  ', gitEmail: '' }))?.gitName).toBeNull();
  });
});

describe('commit authorship in a real repository', () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'aura-commit-'));
  afterAll(() => rmSync(repo, { recursive: true, force: true }));
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git(['init', '-q']);

  const commit = (approver: Approver | null, file: string) => {
    writeFileSync(path.join(repo, file), file);
    git(['add', '-A']);
    git(commitArgs(approver, `change ${file}`, ['AURA-Task: KAN-1', 'AURA-Run: d1'], ['-q']));
    return {
      author: git(['log', '-1', '--format=%an <%ae>']),
      committer: git(['log', '-1', '--format=%cn <%ce>']),
      body: git(['log', '-1', '--format=%B']),
    };
  };

  it('authors as the approver, commits as AURA', () => {
    const c = commit(withGit, 'a.txt');
    expect(c.author).toBe('Dana D <dana@users.noreply.github.com>');
    expect(c.committer).toBe('AURA <aura@localhost>');
    expect(c.body).toContain('Co-authored-by: AURA <aura@localhost>');
    expect(c.body).toContain('AURA-Task: KAN-1');
  });

  it('falls back to AURA with an Approved-by trailer', () => {
    const c = commit(withoutGit, 'b.txt');
    expect(c.author).toBe('AURA <aura@localhost>');
    expect(c.body).toContain('Approved-by: Dana Dev <dana@example.com>');
  });

  it('is plain AURA when nobody is known', () => {
    const c = commit(null, 'c.txt');
    expect(c.author).toBe('AURA <aura@localhost>');
    expect(c.body).not.toContain('Approved-by');
    expect(c.body).toContain('AURA-Run: d1');
  });
});
