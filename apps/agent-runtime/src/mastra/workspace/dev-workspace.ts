import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Where the Dev agent's scaffolds land on disk, separate from the Architect's markdown-only
// workspace (workspace/architect-workspace.ts) since this holds real scaffolded projects, one
// per Epic/discipline. Local-only for this pass (no git branch/PR automation) - a human reviews
// and commits from here themselves.
export const devWorkspaceRoot = process.env.AURA_DEV_ROOT || '.dev-workspaces';

// Resolves (and ensures) the host directory a discipline's scaffold for an Epic lands in. This
// is a plain host path for Docker's bind mount, not a Mastra Workspace/LocalFilesystem - there
// is no per-file read/write API needed here, just one directory handed to the container.
export async function devWorkspaceDir(epicKey: string, discipline: string): Promise<string> {
  const dir = path.resolve(devWorkspaceRoot, epicKey, discipline.toLowerCase());
  await mkdir(dir, { recursive: true });
  return dir;
}
