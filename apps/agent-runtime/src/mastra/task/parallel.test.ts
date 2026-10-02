import { describe, expect, it, vi } from 'vitest';
import { renderPlan, taskPlanSchema, type CheckResult, type Subtask, type TaskInfo } from './contracts';
import { inScope, scopesOverlap, splitPlan, subPlan, taskBranch } from './split';
import { runCoderLoop, type LoopDeps } from './loop';
import { checkResolution, runParallel, sharedNotes, type ParallelDeps } from './parallel';
import { commitMessage, ensureTaskBranch, mergeBranch, type Git } from './git-ops';
import { parseNameStatus } from './workspace-ops';

const task: TaskInfo = { taskKey: 'KAN-45', epicKey: 'KAN-36', summary: 'Ticket list', description: '', issueType: 'Task', discipline: 'Frontend', labels: [] };
const route = { coder: 'backend-nestjs' as const, reason: 'Backend Task on NestJS' };
const green: CheckResult = { command: 'npm test', exitCode: 0, passed: true, output: 'ok' };

const twoParts = taskPlanSchema.parse({
  summary: 'Add a tickets API and the page that lists them.',
  steps: [
    { title: 'Add the tickets endpoint', files: ['apps/api/src/tickets/tickets.controller.ts'] },
    { title: 'Add the TicketList page', files: ['apps/web/src/features/tickets/TicketList.tsx'] },
  ],
  checks: ['npm test'],
  subtasks: [
    { title: 'Tickets API', steps: [1], scope: ['apps/api/src/tickets'] },
    { title: 'Tickets page', steps: [2], scope: ['./apps/web/src/features/tickets/'] },
  ],
});

describe('branches', () => {
  it('names the Task branch under its Epic, and parts with _s<N>', () => {
    expect(taskBranch(task)).toBe('feat/KAN-36/KAN-45');
    expect(taskBranch({ ...task, epicKey: null })).toBe('feat/KAN-45');
    expect(() => taskBranch({ ...task, taskKey: 'x; rm -rf /' })).toThrow();
  });
});

describe('split (code decides single vs parallel)', () => {
  it('keeps a plan without parts on one coder', () => {
    expect(splitPlan(task, route, { ...twoParts, subtasks: [] })).toEqual({ ok: true, subtasks: [] });
  });

  it('resolves two disjoint parts to coders, sub-branches and worktrees', () => {
    const r = splitPlan(task, route, twoParts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subtasks.map((s) => [s.coder, s.branch, s.worktree, s.scope[0]])).toEqual([
      ['backend-nestjs', 'feat/KAN-36/KAN-45_s1', 'KAN-45_s1', 'apps/api/src/tickets'],
      ['frontend-react', 'feat/KAN-36/KAN-45_s2', 'KAN-45_s2', 'apps/web/src/features/tickets'],
    ]);
    expect(renderPlan({ task, route, plan: twoParts, subtasks: r.subtasks })).toContain('## Parallel parts');
    expect(subPlan(twoParts, r.subtasks[1]!).steps.map((s) => s.title)).toEqual(['Add the TicketList page']);
  });

  it('refuses overlapping scopes, shared or missing steps, files outside a scope, and a lone part', () => {
    const bad = (subtasks: unknown) => splitPlan(task, route, taskPlanSchema.parse({ ...twoParts, subtasks }));
    expect(bad([{ title: 'A part', steps: [1], scope: ['apps'] }, { title: 'B part', steps: [2], scope: ['apps/web'] }])).toMatchObject({ ok: false, error: expect.stringContaining('overlap') });
    expect(bad([{ title: 'A part', steps: [1, 2], scope: ['apps/api'] }, { title: 'B part', steps: [2], scope: ['apps/web'] }])).toMatchObject({ ok: false, error: expect.stringContaining('one part') });
    expect(bad([{ title: 'A part', steps: [1], scope: ['apps/api'] }, { title: 'B part', steps: [1], scope: ['apps/web'] }])).toMatchObject({ ok: false });
    expect(bad([{ title: 'A part', steps: [1, 2], scope: ['apps/api'] }, { title: 'B part', steps: [3], scope: ['apps/web'] }])).toMatchObject({ ok: false });
    expect(bad([{ title: 'A part', steps: [1, 2], scope: ['apps/api'] }])).toMatchObject({ ok: false });
    expect(bad([{ title: 'A part', steps: [1], scope: ['apps/api'] }, { title: 'B part', steps: [2], scope: ['apps/web/src/other'] }])).toMatchObject({ ok: false, error: expect.stringContaining('outside') });
    expect(bad([{ title: 'A part', steps: [1], scope: ['*'] }, { title: 'B part', steps: [2], scope: ['apps/web'] }])).toMatchObject({ ok: false, error: expect.stringContaining('whole repository') });
  });

  it('compares scopes by folder, not by string prefix', () => {
    expect(scopesOverlap('apps/web', 'apps/web/src')).toBe(true);
    expect(scopesOverlap('apps/web', 'apps/webhooks')).toBe(false);
    expect(inScope('apps/web/src/a.ts', ['apps/web/**'])).toBe(true);
    expect(inScope('apps/api/a.ts', ['apps/web'])).toBe(false);
  });
});

describe('loop scope', () => {
  it('blocks a part that changes files another part owns', async () => {
    const deps: LoopDeps = {
      code: async () => 'done',
      checks: async () => [green],
      change: async () => ({ files: [{ path: 'apps/web/a.tsx', status: 'modified' }, { path: 'apps/api/x.ts', status: 'modified' }], diff: 'diff', diffStat: '' }),
      evaluate: async () => ({ approved: true, summary: 'ok', findings: [] }),
      notes: async () => [],
      emit: async () => undefined,
    };
    const r = await runCoderLoop({ taskKey: 'KAN-45', plan: twoParts, context: '', maxRounds: 1, scope: ['apps/web'] }, deps);
    expect(r.passed).toBe(false);
    expect(r.rounds[0]!.verdict.findings).toEqual([expect.objectContaining({ severity: 'blocker', file: 'apps/api/x.ts' })]);
  });
});

function subtasks(): Subtask[] {
  const r = splitPlan(task, route, twoParts);
  if (!r.ok) throw new Error(r.error);
  return r.subtasks;
}

function parallelDeps(overrides: Partial<ParallelDeps> = {}): ParallelDeps & { calls: string[] } {
  const calls: string[] = [];
  const passedLoop = { rounds: [{ round: 1, coderSummary: 'ok', checks: [green], verdict: { approved: true, summary: 'fine', findings: [] }, passed: true }], passed: true, change: { files: [], diff: '', diffStat: '' } };
  return {
    calls,
    prepare: async (s) => void calls.push(`prepare ${s.n}`),
    loop: async (s, input) => {
      calls.push(`loop ${s.n} ${input.scope?.join(',')}`);
      return passedLoop;
    },
    commit: async (s) => (calls.push(`commit ${s.n}`), true),
    merge: async (s) => (calls.push(`merge ${s.n}`), { clean: true }),
    resolve: async () => ({ ok: true, summary: 'kept both' }),
    conclude: async () => void calls.push('conclude'),
    abort: async () => void calls.push('abort'),
    cleanup: async (s) => void calls.push(`cleanup ${s.n}`),
    checks: async () => (calls.push('checks'), [green]),
    emit: async () => undefined,
    ...overrides,
  };
}

describe('parallel parts and the merge step', () => {
  it('runs a two-part Task as _s1 + _s2 and merges both', async () => {
    const deps = parallelDeps();
    const r = await runParallel({ taskKey: 'KAN-45', plan: twoParts, subtasks: subtasks(), context: '', maxRounds: 2 }, deps);
    expect(r.passed).toBe(true);
    expect(r.subtasks.map((s) => [s.branch, s.merge])).toEqual([
      ['feat/KAN-36/KAN-45_s1', 'clean'],
      ['feat/KAN-36/KAN-45_s2', 'clean'],
    ]);
    expect(deps.calls).toEqual(['prepare 1', 'prepare 2', 'loop 1 apps/api/src/tickets', 'loop 2 apps/web/src/features/tickets', 'commit 1', 'merge 1', 'cleanup 1', 'commit 2', 'merge 2', 'cleanup 2', 'checks']);
  });

  it('lets the Evaluator resolve a conflict, then runs the checks on the merged result', async () => {
    const deps = parallelDeps({ merge: async (s) => (s.n === 2 ? { clean: false, conflicts: ['package.json'] } : { clean: true }) });
    const r = await runParallel({ taskKey: 'KAN-45', plan: twoParts, subtasks: subtasks(), context: '', maxRounds: 2 }, deps);
    expect(r.subtasks[1]!.merge).toBe('resolved');
    expect(r.passed).toBe(true);
    expect(r.summary).toContain('package.json');
  });

  it('aborts an unresolved conflict, keeps that part for the developer and stops merging', async () => {
    const parts = [...subtasks(), { ...subtasks()[1]!, n: 3, branch: 'feat/KAN-36/KAN-45_s3', worktree: 'KAN-45_s3', scope: ['docs'] }];
    const deps = parallelDeps({ merge: async (s) => (s.n === 2 ? { clean: false, conflicts: ['a.ts'] } : { clean: true }), resolve: async () => ({ ok: false, summary: 'conflict markers left in a.ts' }) });
    const r = await runParallel({ taskKey: 'KAN-45', plan: twoParts, subtasks: parts, context: '', maxRounds: 2 }, deps);
    expect(r.subtasks.map((s) => s.merge)).toEqual(['clean', 'failed', 'skipped']);
    expect(r.passed).toBe(false);
    expect(deps.calls).toContain('abort');
    expect(deps.calls).not.toContain('cleanup 2');
  });

  it('checks the Evaluator\'s resolution before it is written', () => {
    expect(checkResolution(['a.ts'], { summary: 'ok', files: [{ path: 'a.ts', content: 'x' }] })).toBeNull();
    expect(checkResolution(['a.ts', 'b.ts'], { summary: 'ok', files: [{ path: 'a.ts', content: 'x' }] })).toContain('b.ts');
    expect(checkResolution(['a.ts'], { summary: 'ok', files: [{ path: 'a.ts', content: 'x' }, { path: 'c.ts', content: '' }] })).toContain('c.ts');
    expect(checkResolution(['a.ts'], { summary: 'ok', files: [{ path: 'a.ts', content: '<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> s2' }] })).toContain('markers');
  });

  it('gives every parallel coder the developer\'s notes', async () => {
    const take = vi.fn().mockResolvedValueOnce(['use the shared Button']).mockResolvedValue([]);
    const notesFor = sharedNotes(take);
    const a = notesFor();
    const b = notesFor();
    expect(await a()).toEqual(['use the shared Button']);
    expect(await b()).toEqual(['use the shared Button']);
    expect(await a()).toEqual([]);
  });
});

function fakeGit(responses: Record<string, { exitCode: number; output: string }>): Git & { commands: string[] } {
  const commands: string[] = [];
  const run = async (command: string) => {
    commands.push(command);
    const key = Object.keys(responses).find((k) => command.startsWith(k));
    return key ? responses[key]! : { exitCode: 0, output: '' };
  };
  return {
    commands,
    run,
    async ok(command) {
      const r = await run(command);
      if (r.exitCode !== 0) throw new Error(r.output);
      return r.output;
    },
  };
}

describe('git steps', () => {
  it('creates the Task branch from development when the tree is clean', async () => {
    const git = fakeGit({ 'git rev-parse --abbrev-ref HEAD': { exitCode: 0, output: 'development' }, 'git rev-parse --verify --quiet refs/heads/feat': { exitCode: 1, output: '' }, 'git rev-parse HEAD': { exitCode: 0, output: 'abc123' } });
    expect(await ensureTaskBranch(git, 'feat/KAN-36/KAN-45')).toEqual({ base: 'abc123', created: true });
    expect(git.commands).toContain('git checkout -b feat/KAN-36/KAN-45 development');
  });

  it('never switches branch over the developer\'s uncommitted work', async () => {
    const git = fakeGit({ 'git rev-parse --abbrev-ref HEAD': { exitCode: 0, output: 'main' }, 'git status --porcelain': { exitCode: 0, output: ' M src/a.ts' } });
    await expect(ensureTaskBranch(git, 'feat/KAN-45')).rejects.toThrow(/uncommitted/);
  });

  it('reports conflicting files from a merge, and aborts any other failure', async () => {
    const conflicted = fakeGit({ 'git merge --no-ff': { exitCode: 1, output: 'CONFLICT' }, 'git diff --name-only': { exitCode: 0, output: 'package.json\n' } });
    expect(await mergeBranch(conflicted, 'feat/KAN-45_s2', 'Merge part 2')).toEqual({ clean: false, conflicts: ['package.json'] });
    const broken = fakeGit({ 'git merge --no-ff': { exitCode: 128, output: 'fatal' } });
    await expect(mergeBranch(broken, 'feat/KAN-45_s2', 'Merge')).rejects.toThrow(/fatal/);
    expect(broken.commands).toContain('git merge --abort');
  });

  it('keeps commit messages shell-safe', () => {
    expect(commitMessage('feat(KAN-45): add "list" `rm` $(x)')).toBe('feat(KAN-45): add list rm (x)');
  });

  it('reads changed files against a base commit', () => {
    expect(parseNameStatus('M\tsrc/a.ts\nA\tsrc/b.ts\nR100\told.ts\tnew.ts\nD\tgone.ts\n')).toEqual([
      { path: 'src/a.ts', status: 'modified' },
      { path: 'src/b.ts', status: 'added' },
      { path: 'new.ts', status: 'renamed' },
      { path: 'gone.ts', status: 'deleted' },
    ]);
  });
});
