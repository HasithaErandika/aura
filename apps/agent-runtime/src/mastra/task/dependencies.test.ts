import { describe, expect, it } from 'vitest';
import { dependencyKeys, sanitizeDependencies } from './dependencies';

describe('Task dependencies (merge order)', () => {
  it('keeps real dependencies by Task number', () => {
    expect(sanitizeDependencies([{ dependsOn: [] }, { dependsOn: [1] }, { dependsOn: [1, 2] }])).toEqual([
      { task: 2, dependsOn: 1 },
      { task: 3, dependsOn: 1 },
      { task: 3, dependsOn: 2 },
    ]);
  });

  it('drops self, out-of-range and repeated numbers', () => {
    expect(sanitizeDependencies([{ dependsOn: [1, 0, 5, 2.5] }, { dependsOn: [1, 1] }])).toEqual([{ task: 2, dependsOn: 1 }]);
  });

  it('drops the edge that would close a cycle, so the Tasks always have a start order', () => {
    expect(sanitizeDependencies([{ dependsOn: [3] }, { dependsOn: [1] }, { dependsOn: [2] }])).toEqual([
      { task: 1, dependsOn: 3 },
      { task: 2, dependsOn: 1 },
    ]);
    expect(sanitizeDependencies([{ dependsOn: [2] }, { dependsOn: [1] }])).toEqual([{ task: 1, dependsOn: 2 }]);
  });

  it('accepts drafts saved before dependencies existed', () => {
    expect(sanitizeDependencies([{}, {}])).toEqual([]);
  });

  it('maps numbers to the filed Jira keys and skips Tasks not filed', () => {
    const keys: Record<number, string> = { 1: 'KAN-40', 2: 'KAN-41' };
    expect(dependencyKeys([{ task: 2, dependsOn: 1 }, { task: 3, dependsOn: 1 }], (n) => keys[n])).toEqual([{ taskKey: 'KAN-41', dependsOn: 'KAN-40' }]);
  });
});
