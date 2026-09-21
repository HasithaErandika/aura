import { readdir, stat } from 'node:fs/promises';
import { Workspace, LocalFilesystem } from '@mastra/core/workspace';
import { AURA_WORKSPACE_ROOT } from './root';

// Creates one filesystem-only workspace per Epic for Architect documents, written only by
// deterministic code, not by the LLM agents - lives at <AURA_WORKSPACE_ROOT>/<epicKey>/architecture,
// one of three kinds nested under the shared per-Epic root (see workspace/root.ts).
export const workspaceRoot = AURA_WORKSPACE_ROOT;
const root = workspaceRoot;

// Lists every Epic that has an Architect workspace on disk (an `architecture` subfolder) - the
// shared root's top-level folders may also hold `dev`/`qa` subfolders with no architecture at all.
export async function listEpicWorkspaces(): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const epics: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const hasArchitecture = await stat(`${root}/${e.name}/architecture`)
        .then((s) => s.isDirectory())
        .catch(() => false);
      if (hasArchitecture) epics.push(e.name);
    }
    return epics.sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

// Defines the minimal registry type compatible with Mastra and the codebase's MastraLike interfaces.
export interface WorkspaceRegistry {
  listWorkspaces: () => Record<string, { workspace: Workspace }>;
  addWorkspace: (workspace: Workspace, key?: string) => void;
}

// Gets or creates the per-Epic Workspace, registered on the Mastra instance itself.
export function architectWorkspace(mastra: WorkspaceRegistry, epicKey: string): Workspace {
  const key = `architect-${epicKey}`;
  const existing = mastra.listWorkspaces()[key];
  if (existing) return existing.workspace;
  const workspace = new Workspace({
    id: key,
    name: `Architect workspace for ${epicKey}`,
    filesystem: new LocalFilesystem({ basePath: `${root}/${epicKey}/architecture` }),
  });
  mastra.addWorkspace(workspace, key);
  return workspace;
}
