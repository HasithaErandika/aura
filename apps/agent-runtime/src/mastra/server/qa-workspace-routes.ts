import { registerApiRoute } from '@mastra/core/server';
import { qaWorkspace, listQaEpicWorkspaces } from '../workspace/qa-workspace';

// Read-only HTTP API for the QA workspace (Gate 6's test-plan.md + Playwright .spec.ts files) -
// mirrors server/workspace-routes.ts's read routes exactly, same containment guarantee
// (LocalFilesystem), no write route: unlike the Architect's design docs, QA's Playwright source
// isn't meant to be hand-edited from the browser - re-running delegate_to_qa (Gate 6) with
// feedback is how it changes.

function epicKeyParam(raw: string | undefined): string {
  const epicKey = raw?.trim().toUpperCase();
  if (!epicKey) throw new Error('epicKey is required');
  return epicKey;
}

export const listQaEpicsRoute = registerApiRoute('/qa-workspace', {
  method: 'GET',
  handler: async (c) => {
    try {
      const epics = await listQaEpicWorkspaces();
      return c.json({ epics });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  },
});

export const listQaWorkspaceFilesRoute = registerApiRoute('/qa-workspace/:epicKey/files', {
  method: 'GET',
  handler: async (c) => {
    try {
      const epicKey = epicKeyParam(c.req.param('epicKey'));
      const fs = qaWorkspace(c.get('mastra'), epicKey).filesystem;
      if (!fs) return c.json({ files: [] });
      const entries = await fs.readdir('.', { recursive: true });
      const files = entries.filter((e) => e.type === 'file').map((e) => ({ path: e.name, size: e.size ?? null }));
      return c.json({ files });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  },
});

export const readQaWorkspaceFileRoute = registerApiRoute('/qa-workspace/:epicKey/file', {
  method: 'GET',
  handler: async (c) => {
    try {
      const epicKey = epicKeyParam(c.req.param('epicKey'));
      const path = c.req.query('path');
      if (!path) return c.json({ error: 'path query parameter is required' }, 400);
      const fs = qaWorkspace(c.get('mastra'), epicKey).filesystem;
      if (!fs) return c.json({ error: 'workspace filesystem is not available' }, 404);
      const content = await fs.readFile(path, { encoding: 'utf-8' });
      return c.json({ path, content: content.toString() });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
    }
  },
});
