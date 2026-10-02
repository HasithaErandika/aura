import { readdir, stat } from 'node:fs/promises';
import { Workspace, LocalFilesystem } from '@mastra/core/workspace';
import { AURA_WORKSPACE_ROOT } from './root';

// One filesystem workspace per Epic for Architect documents, written only by code: <root>/<EPIC>/architecture.
const root = AURA_WORKSPACE_ROOT;

// Every Epic with an architecture folder on disk.
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
