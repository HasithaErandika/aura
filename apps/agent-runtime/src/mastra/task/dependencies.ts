// The order an Epic's Tasks merge in (docs/plans/aura-git-control-plane.md step 3.4). The Architect
// proposes `dependsOn` by Task number; code keeps only edges that are in range, not self-loops and
// do not close a cycle, so the Tasks always have an order to start in.

export interface DependencyEdge {
  task: number;
  dependsOn: number;
}

export function sanitizeDependencies(tasks: { dependsOn?: number[] }[]): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const after = new Map<number, Set<number>>();
  const reaches = (from: number, to: number): boolean => {
    const seen = new Set<number>();
    const stack = [from];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === to) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(after.get(n) ?? []));
    }
    return false;
  };
  tasks.forEach((t, i) => {
    const task = i + 1;
    for (const dep of new Set(t.dependsOn ?? [])) {
      if (!Number.isInteger(dep) || dep < 1 || dep > tasks.length || dep === task) continue;
      // task waits for dep: an edge dep → task. It would close a cycle if task already reaches dep.
      if (reaches(task, dep)) continue;
      if (!after.has(dep)) after.set(dep, new Set());
      after.get(dep)!.add(task);
      edges.push({ task, dependsOn: dep });
    }
  });
  return edges;
}

// Edges between filed Tasks, as Jira keys; Tasks not filed yet are skipped.
export function dependencyKeys(edges: DependencyEdge[], keyOf: (n: number) => string | undefined): { taskKey: string; dependsOn: string }[] {
  return edges.flatMap((e) => {
    const taskKey = keyOf(e.task);
    const dependsOn = keyOf(e.dependsOn);
    return taskKey && dependsOn ? [{ taskKey, dependsOn }] : [];
  });
}
