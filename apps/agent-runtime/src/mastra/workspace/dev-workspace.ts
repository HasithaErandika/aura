import { mkdir, access, readdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AURA_WORKSPACE_ROOT } from './root';

const execFileAsync = promisify(execFile);

// Where the Dev agent's scaffolds land on disk, nested under the same shared per-Epic root as
// the Architect/QA workspaces (workspace/root.ts) at <root>/<epicKey>/dev/<discipline> - but
// still a plain host path, not a Mastra Workspace/LocalFilesystem: Docker needs to bind-mount it
// directly, and there is no per-file read/write API needed here. Local-only for this pass (no
// git branch/PR automation) - a human reviews and commits from here themselves.
export const devWorkspaceRoot = AURA_WORKSPACE_ROOT;

// The BASE repo for a discipline - scaffolded once (by the first Task of that discipline in the
// Epic), never edited directly by an agent after that. Every Task gets its own git worktree
// branched off this (taskWorktreeDir/ensureTaskWorktree below) - "Concurrent Task Execution"
// milestone: two Tasks of the same discipline must never share one mutable directory, or one
// Task's Coding Agent run can corrupt or race another's (docs/ARCHITECTURE.md).
export async function devWorkspaceDir(epicKey: string, discipline: string): Promise<string> {
  const dir = path.resolve(devWorkspaceRoot, epicKey, 'dev', discipline.toLowerCase());
  await mkdir(dir, { recursive: true });
  return dir;
}

// Where a specific Task's isolated git worktree lives, off the base repo above.
export function taskWorktreeDir(baseDir: string, taskKey: string): string {
  return path.resolve(baseDir, '.worktrees', taskKey);
}

export function taskBranchName(taskKey: string): string {
  return `feature/${taskKey}`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export interface TaskWorktree {
  baseDir: string;
  workDir: string;
  branch: string;
  created: boolean;
}

// Ensures a Task has its own isolated git worktree, checked out on its own branch off the base
// repo's current HEAD - idempotent, so calling this again for a Task that already has one just
// returns it. This is the actual fix for the bug where a second Task of the same discipline
// would re-run the scaffold command (or a Coding Agent run) on top of another Task's changes in
// the same shared directory: from here on, every Task-level tool (Coding Agent, Git tool,
// Tester Agent) operates on `workDir`, never `baseDir`, directly.
//
// Dependency installs are NOT repeated per Task: git worktrees only check out tracked files, and
// `node_modules` is gitignored, so a fresh worktree would otherwise need its own `npm install`
// (slow, and defeats the point of sharing one scaffold). Instead this symlinks the base repo's
// already-installed `node_modules` into the new worktree - a well-known pattern for worktrees +
// Node projects. Best-effort: if there's no `node_modules` yet, or the filesystem doesn't support
// symlinks, the Coding Agent's own `npm install` (if it runs one) just installs for real instead.
export async function ensureTaskWorktree(baseDir: string, taskKey: string): Promise<TaskWorktree> {
  const workDir = taskWorktreeDir(baseDir, taskKey);
  const branch = taskBranchName(taskKey);

  // A worktree's own working directory has a `.git` FILE (pointing back at the base repo's real
  // .git), not a `.git` directory - either way, its presence means the worktree already exists.
  if (await pathExists(path.join(workDir, '.git'))) {
    return { baseDir, workDir, branch, created: false };
  }

  await mkdir(path.dirname(workDir), { recursive: true });
  let branchExists = false;
  try {
    await execFileAsync('git', ['rev-parse', '--verify', '--quiet', branch], { cwd: baseDir });
    branchExists = true;
  } catch {
    branchExists = false;
  }
  // -b creates the branch fresh off HEAD; without it, `worktree add` checks out a branch that
  // already exists (e.g. a worktree was removed by hand but the branch was left behind) - either
  // way the Task ends up on its own branch, never the base repo's default branch.
  await execFileAsync('git', branchExists ? ['worktree', 'add', workDir, branch] : ['worktree', 'add', '-b', branch, workDir], { cwd: baseDir });

  try {
    if (await pathExists(path.join(baseDir, 'node_modules'))) {
      await symlink(path.join(baseDir, 'node_modules'), path.join(workDir, 'node_modules'), 'dir');
    }
  } catch {
    // Not fatal - see the function comment above.
  }

  return { baseDir, workDir, branch, created: true };
}

export interface LocatedTaskWorktree {
  taskKey: string;
  epicKey: string;
  discipline: string;
  path: string;
  branch: string;
}

// Finds a Task's worktree from its key alone by scanning <root>/<epic>/dev/<discipline>/
// .worktrees/<TASK>. A Task only ever has one worktree (delegate_to_dev creates it under the
// discipline read off the Task itself), so the first match is the answer; null if Gate 4 has not
// created one yet. Used by the `aura` CLI's lookup route and the web terminal.
export async function findTaskWorktree(taskKey: string): Promise<LocatedTaskWorktree | null> {
  const root = path.resolve(devWorkspaceRoot);
  const epics = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const epic of epics) {
    if (!epic.isDirectory()) continue;
    const devDir = path.join(root, epic.name, 'dev');
    const disciplines = await readdir(devDir, { withFileTypes: true }).catch(() => []);
    for (const discipline of disciplines) {
      if (!discipline.isDirectory()) continue;
      const workDir = taskWorktreeDir(path.join(devDir, discipline.name), taskKey);
      if (await pathExists(path.join(workDir, '.git'))) {
        return { taskKey, epicKey: epic.name, discipline: discipline.name, path: workDir, branch: taskBranchName(taskKey) };
      }
    }
  }
  return null;
}
