import { registerApiRoute } from '@mastra/core/server';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { devWorkspaceRoot } from '../workspace/dev-workspace';

// Read-only file viewer for a Task's scaffolded directory (devWorkspaceDir), the "companion
// viewer" docs/ARCHITECTURE.md section 6.5 flags as an open gap. devWorkspaceDir is a plain host
// path, not a Mastra Workspace/LocalFilesystem (workspace/dev-workspace.ts's own comment - Docker
// bind-mounts it directly), so containment is checked by hand here the same way
// workspace-routes.ts's writeWorkspaceFileRoute guards against escaping the Epic's own workspace.

function segmentParam(raw: string | undefined, label: string): string {
  const value = raw?.trim();
  if (!value || value.includes('/') || value.includes('\\') || value === '.' || value === '..') {
    throw new Error(`${label} is required and must be a single path segment`);
  }
  return value;
}

// Resolves a task directory the same way devWorkspaceDir does, without creating it - this route
// only ever reads.
function taskDir(epicKey: string, discipline: string): string {
  return path.resolve(devWorkspaceRoot, epicKey, discipline.toLowerCase());
}

// Rejects `..`, an absolute path, or anything that resolves outside `base` - the same
// containment guarantee LocalFilesystem gives the Architect/QA workspaces, reimplemented here
// since devWorkspaceDir predates that abstraction (see the file's own header comment).
function safeJoin(base: string, relPath: string): string {
  const resolved = path.resolve(base, relPath);
  const relFromBase = path.relative(base, resolved);
  if (relFromBase.startsWith('..') || path.isAbsolute(relFromBase)) throw new Error('path escapes the task directory');
  return resolved;
}

async function listFilesRecursive(base: string, dir: string): Promise<{ path: string; size: number }[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: { path: string; size: number }[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(base, full)));
    } else if (entry.isFile()) {
      const s = await stat(full);
      files.push({ path: path.relative(base, full), size: s.size });
    }
  }
  return files;
}

export const listDevWorkspaceFilesRoute = registerApiRoute('/dev-workspace/:epicKey/:discipline/files', {
  method: 'GET',
  handler: async (c) => {
    try {
      const epicKey = segmentParam(c.req.param('epicKey'), 'epicKey').toUpperCase();
      const discipline = segmentParam(c.req.param('discipline'), 'discipline');
      const dir = taskDir(epicKey, discipline);
      const files = await listFilesRecursive(dir, dir);
      return c.json({ files });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  },
});

export const readDevWorkspaceFileRoute = registerApiRoute('/dev-workspace/:epicKey/:discipline/file', {
  method: 'GET',
  handler: async (c) => {
    try {
      const epicKey = segmentParam(c.req.param('epicKey'), 'epicKey').toUpperCase();
      const discipline = segmentParam(c.req.param('discipline'), 'discipline');
      const relPath = c.req.query('path');
      if (!relPath) return c.json({ error: 'path query parameter is required' }, 400);
      const dir = taskDir(epicKey, discipline);
      const filePath = safeJoin(dir, relPath);
      const content = await readFile(filePath, 'utf-8');
      return c.json({ path: relPath, content });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
    }
  },
});
