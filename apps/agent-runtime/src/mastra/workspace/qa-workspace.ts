import { readdir, stat } from 'node:fs/promises';
import { Workspace, LocalFilesystem } from '@mastra/core/workspace';
import type { WorkspaceRegistry } from './architect-workspace';
import { AURA_WORKSPACE_ROOT } from './root';

// Creates one filesystem-only workspace per Epic for QA's test plan and Playwright source,
// written only by deterministic code, not by the LLM agent - lives at
// <AURA_WORKSPACE_ROOT>/<epicKey>/qa, nested under the same shared per-Epic root as the
// Architect/Dev workspaces (workspace/root.ts) but still its own Mastra Workspace/LocalFilesystem
// so test authorship stays a separate, independently-reviewable artifact from both the
// Architect's design docs and the Dev/Coding agents' actual app code (devWorkspaceDir).
export const qaWorkspaceRoot = AURA_WORKSPACE_ROOT;

// Lists every Epic that has a QA workspace on disk (a `qa` subfolder) - mirrors
// architect-workspace.ts's listEpicWorkspaces() so the QA Files viewer can offer Epics to browse
// the same way Design Documents does.
export async function listQaEpicWorkspaces(): Promise<string[]> {
  try {
    const entries = await readdir(qaWorkspaceRoot, { withFileTypes: true });
    const epics: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const hasQa = await stat(`${qaWorkspaceRoot}/${e.name}/qa`)
        .then((s) => s.isDirectory())
        .catch(() => false);
      if (hasQa) epics.push(e.name);
    }
    return epics.sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

// Gets or creates the per-Epic Workspace, registered on the Mastra instance itself.
export function qaWorkspace(mastra: WorkspaceRegistry, epicKey: string): Workspace {
  const key = `qa-${epicKey}`;
  const existing = mastra.listWorkspaces()[key];
  if (existing) return existing.workspace;
  const workspace = new Workspace({
    id: key,
    name: `QA workspace for ${epicKey}`,
    filesystem: new LocalFilesystem({ basePath: `${qaWorkspaceRoot}/${epicKey}/qa` }),
  });
  mastra.addWorkspace(workspace, key);
  return workspace;
}
