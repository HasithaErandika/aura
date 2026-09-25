import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildFileTools } from './file-tools';
import { CHECK_IDS, runCheck, type CheckResult } from '../lib/sandbox';

// Tools for the Coding Council's agents (agents/council-agents.ts), bound by closure to one
// Task's worktree. Same containment rule as file-tools.ts: every path resolves inside `root` or
// the call fails. Read-only tools go to every role that holds tools; the mutating ones
// (write_file, edit_file, run_check) only ever go to the Implementer.

const MAX_FILE_BYTES = 512 * 1024;
const MAX_SEARCH_HITS = 60;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.aura', '.worktrees', 'coverage']);

function safeResolve(root: string, relPath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relPath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Path "${relPath}" resolves outside the Task's directory - refused`);
  }
  return resolved;
}

async function* walk(root: string, dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(root, full);
    else if (entry.isFile()) yield path.relative(root, full);
  }
}

export function buildReadOnlyCouncilTools(root: string) {
  const { list_files, read_file } = buildFileTools(root);

  const search_files = createTool({
    id: 'search_files',
    description: 'Finds lines containing a text (case-insensitive, plain text - not a regex) across the Task directory. Returns up to 60 "path:line: text" hits. Use it to find where something is defined or used before reading whole files.',
    inputSchema: z.object({ query: z.string().min(2).max(200), glob: z.string().max(40).optional().describe('optional file-name suffix filter, e.g. ".tsx"') }),
    outputSchema: z.object({ hits: z.array(z.string()), truncated: z.boolean() }),
    execute: async (input) => {
      const needle = input.query.toLowerCase();
      const hits: string[] = [];
      for await (const rel of walk(root, root)) {
        if (input.glob && !rel.endsWith(input.glob)) continue;
        const full = safeResolve(root, rel);
        if ((await stat(full)).size > MAX_FILE_BYTES) continue;
        const lines = (await readFile(full, 'utf8')).split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i]!.toLowerCase().includes(needle)) continue;
          hits.push(`${rel}:${i + 1}: ${lines[i]!.trim().slice(0, 200)}`);
          if (hits.length >= MAX_SEARCH_HITS) return { hits, truncated: true };
        }
      }
      return { hits, truncated: false };
    },
  });

  return { list_files, read_file, search_files };
}

export function buildImplementerTools(root: string, onCheck?: (result: CheckResult) => void) {
  const readOnly = buildReadOnlyCouncilTools(root);
  const { write_file } = buildFileTools(root);

  // Targeted edits instead of whole-file rewrites: cheaper in tokens (important on free tiers)
  // and far less likely to silently drop unrelated code than write_file on a large file.
  const edit_file = createTool({
    id: 'edit_file',
    description: 'Replaces one exact occurrence of old_text with new_text in a file. old_text must match the file exactly (including indentation) and appear exactly once - include enough surrounding lines to make it unique. Prefer this over write_file for changes to existing files.',
    inputSchema: z.object({ path: z.string().min(1), old_text: z.string().min(1), new_text: z.string() }),
    outputSchema: z.object({ path: z.string(), replaced: z.boolean() }),
    execute: async (input) => {
      const target = safeResolve(root, input.path);
      const content = await readFile(target, 'utf8');
      const first = content.indexOf(input.old_text);
      if (first === -1) throw new Error(`old_text was not found in ${input.path} - read the file again and copy the text exactly`);
      if (content.indexOf(input.old_text, first + 1) !== -1) throw new Error(`old_text appears more than once in ${input.path} - include more surrounding lines so it is unique`);
      await writeFile(target, content.slice(0, first) + input.new_text + content.slice(first + input.old_text.length), 'utf8');
      return { path: input.path, replaced: true };
    },
  });

  const run_check = createTool({
    id: 'run_check',
    description: `Runs one of the project's own checks and returns pass/fail plus its output: ${CHECK_IDS.join(', ')}. Only these ids exist - there is no way to run any other command. A check the project does not define is reported as skipped.`,
    inputSchema: z.object({ check: z.enum(CHECK_IDS) }),
    outputSchema: z.object({ check: z.string(), ok: z.boolean(), output: z.string() }),
    execute: async (input) => {
      const result = await runCheck(root, input.check);
      onCheck?.(result);
      // The model only needs the tail to act on a failure; the full output is in the transcript.
      return { check: result.id, ok: result.ok, output: result.output.slice(-6000) };
    },
  });

  return { ...readOnly, write_file, edit_file, run_check };
}
