import { existsSync } from 'node:fs';
import path from 'node:path';

// The single shared workspace root, one Epic per top-level folder, so there is one place to
// look for everything AURA has produced about an Epic:
//
//   <root>/<EPIC>/
//     architecture/                      Gate 3 - architecture.md, plan.md, docs/srs/, docs/adr/
//     qa/                                Gate 6 - test-plan.md, tests/<scenario>.spec.ts (canonical;
//                                        Gate 7 runs these, mounted read-only)
//     dev/<discipline>/                  Gate 4 - the discipline's BASE repo: the raw scaffold,
//                                        committed once ("chore: initial <discipline> scaffold"),
//                                        never edited by an agent after that
//     dev/.worktrees/<discipline>/<TASK>/ Gate 4 per Task - that Task's own git worktree on branch
//                                        feature/<TASK>, a sibling of the base (never inside it);
//                                        Gate 5 (Coding Agent / Council), the Git tool, CI and
//                                        Gate 7 all work here, never in the base
//
// Architecture and QA use Mastra's Workspace/LocalFilesystem wrapper (containment + the HTTP
// viewer API); dev stays a plain path since Docker bind-mounts it directly.
//
// A relative AURA_WORKSPACE_ROOT (the default, ".workspaces") is resolved against the AURA repo
// root, never the process's working directory: `mastra dev` runs from its own build folder, and a
// cwd-relative root silently put every workspace under apps/agent-runtime/src/mastra/public/.
// An absolute path is used as given.

function findRepoRoot(start: string): string | null {
  let dir = path.resolve(start);
  while (true) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function resolveWorkspaceRoot(): string {
  const configured = process.env.AURA_WORKSPACE_ROOT || '.workspaces';
  if (path.isAbsolute(configured)) return configured;
  // import.meta.dirname is this file's directory (or the bundle's, under `mastra dev`); both sit
  // inside the repo, so walking up from either finds its root. cwd is the last resort.
  const base = findRepoRoot(import.meta.dirname ?? process.cwd()) ?? findRepoRoot(process.cwd()) ?? process.cwd();
  return path.resolve(base, configured);
}

export const AURA_WORKSPACE_ROOT = resolveWorkspaceRoot();
