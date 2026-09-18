import { registerApiRoute } from '@mastra/core/server';
import { architectWorkspace, listEpicWorkspaces } from '../workspace/architect-workspace';

// Provides a read-only HTTP API for viewing Architect workspace documents across the separate services.
// Access control is handled by `apps/api`, while the filesystem’s containment protection prevents path traversal and symlink escapes.

function epicKeyParam(raw: string | undefined): string {
  const epicKey = raw?.trim().toUpperCase();
  if (!epicKey) throw new Error('epicKey is required');
  return epicKey;
}

export const listEpicsRoute = registerApiRoute('/workspace', {
  method: 'GET',
  handler: async (c) => {
    try {
      const epics = await listEpicWorkspaces();
      return c.json({ epics });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  },
});

export const listWorkspaceFilesRoute = registerApiRoute('/workspace/:epicKey/files', {
  method: 'GET',
  handler: async (c) => {
    try {
      const epicKey = epicKeyParam(c.req.param('epicKey'));
      const fs = architectWorkspace(c.get('mastra'), epicKey).filesystem;
      if (!fs) return c.json({ files: [] });
      const entries = await fs.readdir('.', { recursive: true });
      const files = entries.filter((e) => e.type === 'file').map((e) => ({ path: e.name, size: e.size ?? null }));
      return c.json({ files });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  },
});

export const readWorkspaceFileRoute = registerApiRoute('/workspace/:epicKey/file', {
  method: 'GET',
  handler: async (c) => {
    try {
      const epicKey = epicKeyParam(c.req.param('epicKey'));
      const path = c.req.query('path');
      if (!path) return c.json({ error: 'path query parameter is required' }, 400);
      const fs = architectWorkspace(c.get('mastra'), epicKey).filesystem;
      if (!fs) return c.json({ error: 'workspace filesystem is not available' }, 404);
      const content = await fs.readFile(path, { encoding: 'utf-8' });
      return c.json({ path, content: content.toString() });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
    }
  },
});
