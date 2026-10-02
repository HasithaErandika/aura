import { describe, expect, it, vi } from 'vitest';
import { renderPlan, renderReview, roundPassed, taskPlanSchema, type CheckResult, type EvaluatorVerdict } from './contracts';
import { coderForFiles, routeTask } from './router';
import { runCoderLoop, type LoopDeps } from './loop';
import { parsePorcelain, projectChecks, runChecks } from './workspace-ops';
import type { BridgeCaller } from '../bridge/client';

const plan = taskPlanSchema.parse({ summary: 'Add a ticket list page with filters.', steps: [{ title: 'Add the TicketList component', files: ['src/TicketList.tsx'] }], checks: ['npm test'] });
const green: CheckResult = { command: 'npm test', exitCode: 0, passed: true, output: 'ok' };
const red: CheckResult = { command: 'npm test', exitCode: 1, passed: false, output: '1 failed' };
const approve: EvaluatorVerdict = { approved: true, summary: 'Looks right.', findings: [] };

describe('router (code picks the coder)', () => {
  it('sends a Bug to the issue-solver whatever its discipline', () => {
    expect(routeTask({ issueType: 'Bug', discipline: 'Frontend', labels: [] }).coder).toBe('issue-solver');
  });
  it('sends test work to the test-writer, then routes by discipline and backend', () => {
    expect(routeTask({ issueType: 'Task', discipline: 'Backend', labels: ['e2e'] }).coder).toBe('test-writer');
    expect(routeTask({ issueType: 'Task', discipline: 'Frontend', labels: [] }).coder).toBe('frontend-react');
    expect(routeTask({ issueType: 'Task', discipline: 'Backend', labels: [], backend: 'Spring Boot' }).coder).toBe('backend-spring');
    expect(routeTask({ issueType: 'Task', discipline: 'Integration', labels: [], backend: 'NestJS' }).coder).toBe('backend-nestjs');
    expect(routeTask({ issueType: 'Task', discipline: null, labels: [] }).coder).toBe('issue-solver');
  });
  it('picks a coder from a file scope', () => {
    expect(coderForFiles(['apps/web/src/List.tsx', 'apps/web/src/list.css'], 'backend-nestjs')).toBe('frontend-react');
    expect(coderForFiles(['src/tickets.service.spec.ts'], 'backend-nestjs')).toBe('test-writer');
    expect(coderForFiles(['src/tickets.service.ts'], 'backend-nestjs')).toBe('backend-nestjs');
  });
});

describe('a round passes only when code agrees', () => {
  it('needs green checks and no blocker or major finding, whatever the Evaluator says', () => {
    expect(roundPassed(approve, [green])).toBe(true);
    expect(roundPassed(approve, [red])).toBe(false);
    expect(roundPassed({ ...approve, findings: [{ severity: 'major', file: 'a.ts', message: 'wrong status code' }] }, [green])).toBe(false);
    expect(roundPassed({ ...approve, findings: [{ severity: 'minor', file: null, message: 'naming' }] }, [green])).toBe(true);
  });
});

function deps(overrides: Partial<LoopDeps> = {}): LoopDeps & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    code: async (p) => (prompts.push(p), 'done'),
    checks: async () => [green],
    change: async () => ({ files: [{ path: 'src/TicketList.tsx', status: 'added' }], diff: '+x', diffStat: ' 1 file changed' }),
    evaluate: async () => approve,
    notes: async () => [],
    emit: async () => undefined,
    ...overrides,
  };
}

describe('coder ↔ Evaluator loop', () => {
  it('stops after a passing round', async () => {
    const d = deps();
    const result = await runCoderLoop({ taskKey: 'KAN-45', plan, context: '', maxRounds: 3 }, d);
    expect(result.passed).toBe(true);
    expect(result.rounds).toHaveLength(1);
    expect(d.prompts[0]).toContain('Implement Jira Task KAN-45');
  });

  it('sends the findings and failing output back to the coder, and gives up after the last round', async () => {
    const d = deps({ checks: vi.fn(async () => [red]), notes: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(['use the shared Table component']).mockResolvedValue([]) });
    const result = await runCoderLoop({ taskKey: 'KAN-45', plan, context: '', maxRounds: 2 }, d);
    expect(result.passed).toBe(false);
    expect(result.rounds).toHaveLength(2);
    expect(d.prompts[1]).toContain('1 failed');
    expect(d.prompts[1]).toContain('use the shared Table component');
  });

  it('fails a round that changed nothing without asking the Evaluator', async () => {
    const evaluate = vi.fn(async () => approve);
    const result = await runCoderLoop({ taskKey: 'KAN-45', plan, context: '', maxRounds: 1 }, deps({ evaluate, change: async () => ({ files: [], diff: '', diffStat: '' }) }));
    expect(result.passed).toBe(false);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('renders the plan and the review for the gates', () => {
    const md = renderPlan({ task: { taskKey: 'KAN-45', epicKey: 'KAN-36', summary: 'Ticket list', description: '', issueType: 'Task', discipline: 'Frontend', labels: [] }, route: { coder: 'frontend-react', reason: 'Frontend Task' }, plan });
    expect(md).toContain('**Coder:** frontend-react');
    const review = renderReview({ planDraftId: 'p', taskKey: 'KAN-45', coder: 'frontend-react', passed: true, rounds: [{ round: 1, coderSummary: 'done', checks: [green], verdict: approve, passed: true }], changedFiles: [{ path: 'src/TicketList.tsx', status: 'added' }], diffStat: '' });
    expect(review).toContain('✅ `npm test`');
  });
});

describe('workspace operations', () => {
  it('reads git status', () => {
    expect(parsePorcelain(' M src/a.ts\n?? src/b.ts\nR  old.ts -> new.ts\nD  gone.ts\n')).toEqual([
      { path: 'src/a.ts', status: 'modified' },
      { path: 'src/b.ts', status: 'untracked' },
      { path: 'new.ts', status: 'renamed' },
      { path: 'gone.ts', status: 'deleted' },
    ]);
  });

  it('prefers the project\'s checks and runs them through the bridge', async () => {
    const call = vi.fn(async (op: string, args: Record<string, unknown>) => {
      if (op === 'fs.readFile') {
        if (args.path === '.aura/settings.json') return { content: JSON.stringify({ checks: ['npm run lint', 'npm test'] }), encoding: 'utf8' };
        throw new Error('not found');
      }
      return { exitCode: args.command === 'npm test' ? 1 : 0, stdout: 'out', stderr: '', timedOut: false, executionTimeMs: 1 };
    });
    const bridge = { call } as unknown as BridgeCaller;
    const checks = await projectChecks(bridge);
    expect(checks).toEqual(['npm run lint', 'npm test']);
    expect((await runChecks(bridge, checks!)).map((c) => c.passed)).toEqual([true, false]);
  });
});
