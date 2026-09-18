import { registerApiRoute } from '@mastra/core/server';
import { architectWorkspace, listEpicWorkspaces } from '../workspace/architect-workspace';
import { draftStore } from '../store/draft-store';

// Provides a read/write HTTP API for the Architect workspace across the separate services.
// Access control is handled by `apps/api`, while the filesystem's containment protection
// prevents path traversal and symlink escapes. Reads have always been open; writes
// (writeWorkspaceFileRoute) are new and deliberately narrow - see its own comment.

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

// Overwrites one existing design document with human-edited content (docs/ARCHITECTURE.md
// section 6.3 "manual edit"). Deliberately narrow: only a file the Architect Workflow already
// wrote can be overwritten - this cannot create new files or write outside the Epic's own
// workspace. apps/api gates who may call this (architect role only) and audits every call;
// this route trusts that gate the same way the read routes already do. There is no version
// history for a manual edit - it simply replaces the file, and a later agent revise (`file`
// mode) will overwrite it again from the draft.
export const writeWorkspaceFileRoute = registerApiRoute('/workspace/:epicKey/file', {
  method: 'PUT',
  handler: async (c) => {
    try {
      const epicKey = epicKeyParam(c.req.param('epicKey'));
      const body = await c.req.json<{ path?: string; content?: string }>();
      const path = body.path?.trim();
      if (!path) return c.json({ error: 'path is required' }, 400);
      if (typeof body.content !== 'string') return c.json({ error: 'content is required' }, 400);
      const fs = architectWorkspace(c.get('mastra'), epicKey).filesystem;
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

// Which Orchestrator thread most recently produced this Epic's architecture draft, so the web
// app's "send feedback to the Architect" action can continue that conversation instead of
// starting a fresh one with no memory of the draftId to revise (delegate_to_architect revise
// needs a draftId, which only exists in the tool-call history of the thread that drafted it).
export const getArchitectThreadRoute = registerApiRoute('/workspace/:epicKey/thread', {
  method: 'GET',
  handler: async (c) => {
    try {
      const epicKey = epicKeyParam(c.req.param('epicKey'));
      const threadId = await draftStore.latestThreadFor('architecture', epicKey);
      return c.json({ threadId });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  },
});
