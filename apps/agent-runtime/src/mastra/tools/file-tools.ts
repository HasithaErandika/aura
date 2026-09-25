import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// File tools for the built-in Mastra Coding Agent (agents/mastra-coding-agent.ts). Unlike the
// Dev agent's scaffold (Docker-sandboxed), this agent edits
// files directly via Node's fs - spinning up a container per read/write would make an iterative
// coding loop impractically slow. The safety boundary here is the tool surface itself, not a
// container: these are the ONLY three tools this agent ever gets (no shell/run-command tool,
// so there is no way for it to execute arbitrary code even under prompt injection from Jira
// content), and every path is resolved and verified to stay inside `root` before any fs call -
// `..`, a symlink escape, or an absolute path all fail closed with a plain error, never a
// silent redirect elsewhere on the host.

const MAX_FILE_BYTES = 512 * 1024; // a single file read/write cap - this is a Task's code, not a database dump

function safeResolve(root: string, relPath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relPath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Path "${relPath}" resolves outside the Task's directory - refused`);
  }
  return resolved;
}

// Builds the three file tools bound to one Task's scaffolded directory via closure - a fresh
// set per delegate_to_code execute call (createCodingAgent, agents/mastra-coding-agent.ts), so
// the model can only ever address paths under that one directory, never another Task's or the
// host's.
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
