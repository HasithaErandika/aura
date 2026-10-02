import { describe, expect, it, vi } from 'vitest';
import { taskPlanSchema, type TaskPlanDraft, type TaskReviewDraft } from './contracts';
import { compareUrl, parsePrUrl, parseRemote, prBody, prTitle, renderPrDraft, validReviewers, type TaskPrDraft } from './pr';
import { commitAll, ghPrCreate, type Git } from './git-ops';
import { recordTaskPr, renderPrStatus } from './aura-api';
import type { BridgeCaller } from '../bridge/client';

const plan: TaskPlanDraft = {
  task: { taskKey: 'KAN-45', epicKey: 'KAN-36', summary: 'List tickets', description: '', issueType: 'Task', discipline: 'Frontend', labels: [] },
  route: { coder: 'frontend-react', reason: 'Frontend Task' },
  plan: taskPlanSchema.parse({ summary: 'Add a ticket list page.', steps: [{ title: 'Add TicketList', files: ['src/TicketList.tsx'] }], checks: ['npm test'] }),
  branch: 'feat/KAN-36/KAN-45',
};
const review: TaskReviewDraft = {
  planDraftId: 'PLAN-1',
  taskKey: 'KAN-45',
  coder: 'frontend-react',
  rounds: [{ round: 1, coderSummary: 'done', checks: [{ command: 'npm test', exitCode: 0, passed: true, output: '' }], verdict: { approved: true, summary: 'Matches the plan | tested', findings: [] }, passed: true }],
  passed: true,
  changedFiles: [{ path: 'src/TicketList.tsx', status: 'added' }],
  diffStat: '',
  branch: 'feat/KAN-36/KAN-45',
  baseRef: 'abc1234',
};

describe('Gate 6 pull request', () => {
  it('writes a description with provenance: plan, checks, Evaluator, gates and the run', () => {
    const body = prBody({ plan, review, reviewDraftId: 'REVIEW-2', runId: 'run-1', webUrl: 'https://aura.example/' });
    expect(body).toContain('## KAN-45: List tickets');
    expect(body).toContain('✅ `npm test` (exit 0)');
    expect(body).toContain('| Gate 4 plan | PLAN-1, approved by the developer |');
    expect(body).toContain('| Gate 5 review | REVIEW-2, accepted by the developer |');
    expect(body).toContain('Matches the plan / tested');
    expect(body).toContain('[run-1](https://aura.example/app/runs/run-1)');
  });

  it('keeps titles and reviewers safe for the shell', () => {
    expect(prTitle('KAN-45', 'List "tickets" $(rm -rf ~)')).toBe('KAN-45: List tickets (rm -rf )');
    expect(validReviewers(['@octocat', 'acme/qa-team', 'bad user', '--admin', 'octocat', 7])).toEqual(['octocat', 'acme/qa-team']);
    const d: TaskPrDraft = { reviewDraftId: 'R', planDraftId: 'P', taskKey: 'KAN-45', epicKey: null, branch: 'feat/KAN-45', base: 'development', baseRef: null, title: 'KAN-45: x', body: 'b', reviewers: [] };
    expect(renderPrDraft(d)).toContain('none (add them in .aura/settings.json "reviewers"');
  });

  it('reads GitHub remotes and the PR gh opened', () => {
    expect(parseRemote('git@github.com:acme/tickets.git')).toBe('acme/tickets');
    expect(parseRemote('https://github.com/acme/tickets')).toBe('acme/tickets');
    expect(parseRemote('https://gitlab.com/acme/tickets.git')).toBeNull();
    expect(parsePrUrl('Creating pull request...\nhttps://github.com/acme/tickets/pull/12\n')).toEqual({ url: 'https://github.com/acme/tickets/pull/12', number: 12 });
    expect(parsePrUrl('a pull request for branch "feat/KAN-45" into branch "development" already exists:\nhttps://github.com/acme/tickets/pull/9')).toMatchObject({ number: 9 });
    expect(compareUrl('acme/tickets', 'feat/KAN-45')).toBe('https://github.com/acme/tickets/compare/development...feat/KAN-45?expand=1');
  });
});

function fakeGit(responses: Record<string, { exitCode: number; output: string }>): Git & { commands: string[] } {
  const commands: string[] = [];
  const run = async (command: string) => {
    commands.push(command);
    const key = Object.keys(responses).find((k) => command.startsWith(k));
    return key ? responses[key]! : { exitCode: 0, output: '' };
  };
  return { commands, run, ok: async (c) => { const r = await run(c); if (r.exitCode) throw new Error(r.output); return r.output; } };
}

describe('Gate 6 git steps', () => {
  it('commits the accepted change only when there is one', async () => {
    const clean = fakeGit({});
    expect(await commitAll(clean, 'KAN-45: x')).toBe(false);
    const dirty = fakeGit({ 'git diff --cached --quiet': { exitCode: 1, output: '' } });
    expect(await commitAll(dirty, 'KAN-45: x')).toBe(true);
    expect(dirty.commands.at(-1)).toBe('git commit -m "KAN-45: x"');
  });

  it('opens the PR with gh and a body file it removes after, or reports that gh is missing', async () => {
    const files: string[] = [];
    const bridge = { call: vi.fn(async (op: string, args: { path: string }) => void (op === 'fs.deleteFile' ? files.splice(files.indexOf(args.path), 1) : op === 'fs.writeFile' && files.push(args.path))) } as unknown as BridgeCaller;
    const git = fakeGit({ 'gh pr create': { exitCode: 0, output: 'https://github.com/acme/tickets/pull/12' } });
    const r = await ghPrCreate(git, bridge, { branch: 'feat/KAN-36/KAN-45', base: 'development', title: 'KAN-45: x', body: 'body', reviewers: ['octocat', 'x; rm'], taskKey: 'KAN-45' });
    expect(r?.output).toContain('/pull/12');
    expect(git.commands.at(-1)).toBe('gh pr create --base development --head feat/KAN-36/KAN-45 --title "KAN-45: x" --body-file .aura/tmp/pr-KAN-45.md --reviewer octocat');
    expect(files).toEqual(['.aura/tmp/.gitignore']);
    expect(await ghPrCreate(fakeGit({ 'gh --version': { exitCode: 127, output: 'not found' } }), bridge, { branch: 'b', base: 'development', title: 't', body: '', reviewers: [], taskKey: 'KAN-45' })).toBeNull();
  });
});

describe('AURA API for Task PRs', () => {
  it('records the PR with the runtime token', async () => {
    vi.stubEnv('AURA_API_URL', 'http://api.test');
    vi.stubEnv('MASTRA_RUNTIME_TOKEN', 'secret');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ taskPr: { taskKey: 'KAN-45' } }), { status: 201 }));
    await recordTaskPr({ taskKey: 'KAN-45', epicKey: null, repo: 'acme/tickets', branch: 'feat/KAN-45', baseSha: 'abc1234', headSha: 'def5678', prNumber: 12, prUrl: 'https://github.com/acme/tickets/pull/12', title: 'KAN-45: x', reviewers: [], runId: null }, fetchImpl as unknown as typeof fetch);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/internal/task-prs');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    vi.unstubAllEnvs();
  });

  it('shows CI as QA sees it', () => {
    const text = renderPrStatus({ taskKey: 'KAN-45', branch: 'feat/KAN-45', repo: 'acme/tickets', prNumber: 12, prUrl: 'https://github.com/acme/tickets/pull/12', prTitle: 'x', prState: 'open', reviewers: [], ciState: 'failure', ciUrl: 'https://github.com/acme/tickets/actions/runs/1', ciSummary: { jobs: [{ name: 'frontend', result: 'failure' }], tests: { passed: 10, failed: 1, skipped: 0 } }, ciUpdatedAt: null });
    expect(text).toContain('❌ CI failed');
    expect(text).toContain('❌ frontend: failure');
    expect(text).toContain('Tests: 10 passed, 1 failed, 0 skipped');
  });
});
