import { coderForFiles } from './router';
import type { Route, Subtask, TaskInfo, TaskPlan } from './contracts';

// Single vs parallel (plan §7, §8): the agent may propose parts with file scopes; code decides
// whether they are valid (every step in exactly one part, scopes that never overlap, each step's
// files inside its part's scope), picks each part's coder from its files, and names the branches.

const KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

export function taskBranch(task: Pick<TaskInfo, 'taskKey' | 'epicKey'>): string {
  if (!KEY.test(task.taskKey)) throw new Error(`invalid Task key ${task.taskKey}`);
  return task.epicKey && KEY.test(task.epicKey) ? `feat/${task.epicKey}/${task.taskKey}` : `feat/${task.taskKey}`;
}

// `_s1`, not `/s1`: git can't hold both feat/X/T and feat/X/T/s1.
export function subBranch(branch: string, n: number): string {
  return `${branch}_s${n}`;
}

// A scope entry as a plain folder-or-file prefix: "./a/b/" → "a/b"; globs keep their fixed part.
export function normalizeScope(entry: string): string {
  const fixed = entry.trim().replace(/\\/g, '/').split(/[*?[{]/)[0]!;
  return fixed.replace(/^\.?\/+/, '').replace(/\/+$/, '');
}

function within(file: string, scope: string): boolean {
  const f = normalizeScope(file);
  return scope === '' || f === scope || f.startsWith(`${scope}/`);
}

export function scopesOverlap(a: string, b: string): boolean {
  return within(a, normalizeScope(b)) || within(b, normalizeScope(a));
}

export function inScope(file: string, scope: string[]): boolean {
  return scope.some((s) => within(file, normalizeScope(s)));
}

export type SplitResult = { ok: true; subtasks: Subtask[] } | { ok: false; error: string };

export function splitPlan(task: TaskInfo, route: Route, plan: TaskPlan): SplitResult {
  const parts = plan.subtasks ?? [];
  if (parts.length === 0) return { ok: true, subtasks: [] };
  if (parts.length === 1) return { ok: false, error: 'subtasks: list 2-4 parts, or none for a single coder' };
  const owner = new Map<number, number>();
  for (const [i, part] of parts.entries()) {
    if (part.scope.some((s) => normalizeScope(s) === '')) return { ok: false, error: `part ${i + 1} ("${part.title}") claims the whole repository; give it its own folders or files` };
    for (const step of part.steps) {
      if (step > plan.steps.length) return { ok: false, error: `part ${i + 1} names step ${step}, but the plan has ${plan.steps.length} steps` };
      if (owner.has(step)) return { ok: false, error: `step ${step} is in parts ${owner.get(step)! + 1} and ${i + 1}; each step belongs to one part` };
      owner.set(step, i);
    }
  }
  const missing = plan.steps.map((_, i) => i + 1).filter((n) => !owner.has(n));
  if (missing.length) return { ok: false, error: `steps ${missing.join(', ')} are in no part; every step belongs to exactly one part` };
  for (let a = 0; a < parts.length; a += 1) {
    for (let b = a + 1; b < parts.length; b += 1) {
      for (const x of parts[a]!.scope) {
        const clash = parts[b]!.scope.find((y) => scopesOverlap(x, y));
        if (clash) return { ok: false, error: `parts ${a + 1} and ${b + 1} overlap ("${x}" and "${clash}"); parallel parts must change disjoint files` };
      }
    }
  }
  for (const [i, part] of parts.entries()) {
    for (const step of part.steps) {
      const outside = plan.steps[step - 1]!.files.filter((f) => !inScope(f, part.scope));
      if (outside.length) return { ok: false, error: `step ${step} changes ${outside.join(', ')}, outside part ${i + 1}'s scope (${part.scope.join(', ')})` };
    }
  }
  const branch = taskBranch(task);
  return {
    ok: true,
    subtasks: parts.map((part, i) => {
      const n = i + 1;
      const files = [...part.steps.flatMap((s) => plan.steps[s - 1]!.files), ...part.scope];
      return { n, title: part.title, steps: [...part.steps].sort((x, y) => x - y), scope: part.scope.map(normalizeScope), coder: coderForFiles(files, route.coder), branch: subBranch(branch, n), worktree: `${task.taskKey}_s${n}` };
    }),
  };
}

// The plan as one part sees it: its own steps only, and the rule to stay in its scope.
export function subPlan(plan: TaskPlan, sub: Subtask): TaskPlan {
  return {
    ...plan,
    summary: `${plan.summary}\n\nYour part (${sub.n}): ${sub.title}. Other coders do the other parts in parallel. Change only files inside: ${sub.scope.join(', ')}.`,
    steps: sub.steps.map((n) => plan.steps[n - 1]!),
    subtasks: [],
  };
}
