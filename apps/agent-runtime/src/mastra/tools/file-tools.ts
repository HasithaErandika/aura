import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// File tools for the built-in Mastra Coding Agent. Its only tools: no shell, and every path is
// resolved inside `root` before any fs call, so `..`, symlinks and absolute paths fail closed.

const MAX_FILE_BYTES = 512 * 1024; // a single file read/write cap - this is a Task's code, not a database dump

export function safeResolve(root: string, relPath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relPath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Path "${relPath}" resolves outside the Task's directory - refused`);
  }
  return resolved;
}

// Three file tools bound to one Task's directory, so no path outside it is reachable.
export function buildFileTools(root: string) {
  const list_files = createTool({
    id: 'list_files',
    description: "Lists every file under the Task's directory (recursive, relative paths). Call this first to see what exists.",
    inputSchema: z.object({}),
    outputSchema: z.object({ files: z.array(z.string()) }),
    execute: async () => {
      const out: string[] = [];
      async function walk(dir: string) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(full);
          else out.push(path.relative(root, full));
        }
      }
      await walk(root);
      return { files: out };
    },
  });

  const read_file = createTool({
    id: 'read_file',
    description: "Reads one file's content, as UTF-8 text. Path is relative to the Task's directory.",
    inputSchema: z.object({ path: z.string().min(1) }),
    outputSchema: z.object({ content: z.string() }),
    execute: async (input) => {
      const target = safeResolve(root, input.path);
      const info = await stat(target);
      if (info.size > MAX_FILE_BYTES) throw new Error(`${input.path} is too large to read (${info.size} bytes, limit ${MAX_FILE_BYTES})`);
      return { content: await readFile(target, 'utf8') };
    },
  });

  const write_file = createTool({
    id: 'write_file',
    description: "Writes (creates or overwrites) one file with the given content, as UTF-8 text. Path is relative to the Task's directory. Creates parent directories as needed.",
    inputSchema: z.object({ path: z.string().min(1), content: z.string().max(MAX_FILE_BYTES) }),
    outputSchema: z.object({ path: z.string() }),
    execute: async (input) => {
      const target = safeResolve(root, input.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, input.content, 'utf8');
      return { path: input.path };
    },
  });

  return { list_files, read_file, write_file };
}
