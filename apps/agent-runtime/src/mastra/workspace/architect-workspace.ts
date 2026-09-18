import { readdir } from 'node:fs/promises';
import { Workspace, LocalFilesystem } from '@mastra/core/workspace';

// Creates one filesystem-only workspace per Epic for Architect documents, written only by deterministic code-not by the LLM agents.
// Uses an absolute workspace path via `AURA_WORKSPACE_ROOT` or `.workspaces` to avoid environment-dependent path resolution.

export const workspaceRoot = process.env.AURA_WORKSPACE_ROOT || '.workspaces';
const root = workspaceRoot;

// Lists every Epic that has a workspace on disk.
export async function listEpicWorkspaces(): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
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
    filesystem: new LocalFilesystem({ basePath: `${root}/${epicKey}` }),
  });
  mastra.addWorkspace(workspace, key);
  return workspace;
}
