import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildImplementerTools, buildReadOnlyCouncilTools } from './council-tools';

// The council's tools are its only way to touch code - containment and exact-edit rules matter.

const root = mkdtempSync(path.join(os.tmpdir(), 'aura-tools-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

type Exec = (input: Record<string, unknown>, ctx?: unknown) => Promise<unknown>;
const run = (tool: unknown, input: Record<string, unknown>) => (tool as { execute: Exec }).execute(input, {});

describe('edit_file', () => {
  const tools = buildImplementerTools(root);

  it('replaces exactly one occurrence', async () => {
    writeFileSync(path.join(root, 'a.ts'), 'const x = 1;\nconst y = 2;\n');
    await run(tools.edit_file, { path: 'a.ts', old_text: 'const y = 2;', new_text: 'const y = 3;' });
    expect(readFileSync(path.join(root, 'a.ts'), 'utf8')).toBe('const x = 1;\nconst y = 3;\n');
  });

  it('refuses when old_text is missing or ambiguous', async () => {
    writeFileSync(path.join(root, 'b.ts'), 'a\na\n');
    await expect(run(tools.edit_file, { path: 'b.ts', old_text: 'zzz', new_text: 'q' })).rejects.toThrow(/not found/);
    await expect(run(tools.edit_file, { path: 'b.ts', old_text: 'a', new_text: 'q' })).rejects.toThrow(/more than once/);
  });

  it('refuses paths outside the Task directory', async () => {
    await expect(run(tools.edit_file, { path: '../../etc/passwd', old_text: 'x', new_text: 'y' })).rejects.toThrow(/outside/);
  });
});

describe('read-only tools', () => {
  it('gives the Planner no way to write', () => {
    const tools = buildReadOnlyCouncilTools(root);
    expect(Object.keys(tools).sort()).toEqual(['list_files', 'read_file', 'search_files']);
  });

  it('gives only the Implementer write, edit and run_check', () => {
    expect(Object.keys(buildImplementerTools(root)).sort()).toEqual(['edit_file', 'list_files', 'read_file', 'run_check', 'search_files', 'write_file']);
  });

  it('finds text across files, case-insensitively', async () => {
    writeFileSync(path.join(root, 'c.ts'), 'export function ResetToken() {}\n');
    const { hits } = (await run(buildReadOnlyCouncilTools(root).search_files, { query: 'resettoken' })) as { hits: string[] };
    expect(hits.some((h) => h.startsWith('c.ts:1:'))).toBe(true);
  });
});
