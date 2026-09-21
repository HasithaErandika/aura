import { readdir } from 'node:fs/promises';
import { Workspace, LocalFilesystem } from '@mastra/core/workspace';
import type { WorkspaceRegistry } from './architect-workspace';

// Creates one filesystem-only workspace per Epic for QA's test plan and Playwright source,
// written only by deterministic code, not by the LLM agent - same pattern as
// workspace/architect-workspace.ts, kept as its own root (AURA_QA_ROOT) so test authorship
// stays a separate, independently-reviewable artifact from both the Architect's design docs and
// the Dev/Coding agents' actual app code (devWorkspaceDir).

export const qaWorkspaceRoot = process.env.AURA_QA_ROOT || '.qa-workspaces';

// Lists every Epic that has a QA workspace on disk - mirrors architect-workspace.ts's
// listEpicWorkspaces() so the QA Files viewer can offer Epics to browse the same way Design
// Documents does.
export async function listQaEpicWorkspaces(): Promise<string[]> {
  try {
    const entries = await readdir(qaWorkspaceRoot, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
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
    filesystem: new LocalFilesystem({ basePath: `${qaWorkspaceRoot}/${epicKey}` }),
  });
  mastra.addWorkspace(workspace, key);
  return workspace;
}
