import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { AURA_WORKSPACE_ROOT } from './root';

// Where the Dev agent's scaffolds land on disk, nested under the same shared per-Epic root as
// the Architect/QA workspaces (workspace/root.ts) at <root>/<epicKey>/dev/<discipline> - but
// still a plain host path, not a Mastra Workspace/LocalFilesystem: Docker needs to bind-mount it
// directly, and there is no per-file read/write API needed here. Local-only for this pass (no
// git branch/PR automation) - a human reviews and commits from here themselves.
export const devWorkspaceRoot = AURA_WORKSPACE_ROOT;

// Resolves (and ensures) the host directory a discipline's scaffold for an Epic lands in.
export async function devWorkspaceDir(epicKey: string, discipline: string): Promise<string> {
  const dir = path.resolve(devWorkspaceRoot, epicKey, 'dev', discipline.toLowerCase());
  await mkdir(dir, { recursive: true });
  return dir;
}
