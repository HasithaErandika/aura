import { registerApiRoute } from '@mastra/core/server';
import { qaWorkspace, listQaEpicWorkspaces } from '../workspace/qa-workspace';

// HTTP API for the QA workspace (Gate 6's test-plan.md + Playwright .spec.ts files) - mirrors
// server/workspace-routes.ts's routes exactly, same containment guarantee (LocalFilesystem). The
// write route (writeQaWorkspaceFileRoute) is the same narrow shape as the Architect's: it can
// only overwrite a file Gate 6 already filed, never create a new one or escape the Epic's own
// workspace. apps/api gates who may call it (qa_engineer role only) and audits every call. A
// later delegate_to_qa revise+file for the same Epic will overwrite it again from the new draft.

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

// Overwrites one existing test-plan.md or .spec.ts file with human-edited content (the QA
// Engineer hand-fixing or hand-tweaking Gate 6 output). Only a file that already exists can be
// overwritten - this cannot create a new file or write outside the Epic's own QA workspace.
export const writeQaWorkspaceFileRoute = registerApiRoute('/qa-workspace/:epicKey/file', {
  method: 'PUT',
  handler: async (c) => {
    try {
      const epicKey = epicKeyParam(c.req.param('epicKey'));
      const body = await c.req.json<{ path?: string; content?: string }>();
      const path = body.path?.trim();
      if (!path) return c.json({ error: 'path is required' }, 400);
      if (typeof body.content !== 'string') return c.json({ error: 'content is required' }, 400);
      const fs = qaWorkspace(c.get('mastra'), epicKey).filesystem;
      if (!fs) return c.json({ error: 'workspace filesystem is not available' }, 404);
      const entries = await fs.readdir('.', { recursive: true });
      if (!entries.some((e) => e.type === 'file' && e.name === path)) return c.json({ error: 'file does not exist' }, 404);
      await fs.writeFile(path, body.content, { overwrite: true });
      return c.json({ path, content: body.content });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  },
});
