import { mkdir, access, appendFile, readdir, readFile, symlink } from 'node:fs/promises';
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

// A discipline's base repo, scaffolded once; every Task works in its own worktree off it.
export async function devWorkspaceDir(epicKey: string, discipline: string): Promise<string> {
  const dir = path.resolve(devWorkspaceRoot, epicKey, 'dev', discipline.toLowerCase());
  await mkdir(dir, { recursive: true });
  return dir;
}

// A Task's worktree path, a sibling of the base repo so base tools never walk into it.
export function taskWorktreeDir(baseDir: string, taskKey: string): string {
  return path.resolve(path.dirname(baseDir), '.worktrees', path.basename(baseDir), taskKey);
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

// Paths AURA creates inside a discipline's repo that must never show up as changes or be
// committed: Task worktrees nested in the base (.worktrees/), the council's transcripts (.aura/),
// the coding prompt file, and the node_modules SYMLINK each worktree gets (a scaffold's
// "node_modules/" ignore rule only matches directories, not a symlink). Written to the repo's
// shared info/exclude - local to this machine, never a tracked .gitignore change - so the base
// stays clean and every worktree's `git status` shows only that Task's real changes.
const AURA_LOCAL_PATHS = ['.worktrees/', '.aura/', '.aura-task-prompt.txt', 'node_modules'];

export async function ensureAuraExcludes(repoDir: string): Promise<void> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--git-common-dir'], { cwd: repoDir });
  const excludeFile = path.join(path.resolve(repoDir, stdout.trim()), 'info', 'exclude');
  const current = await readFile(excludeFile, 'utf8').catch(() => '');
  const lines = current.split('\n');
  const missing = AURA_LOCAL_PATHS.filter((p) => !lines.includes(p));
  if (missing.length === 0) return;
  await mkdir(path.dirname(excludeFile), { recursive: true });
  await appendFile(excludeFile, `${current && !current.endsWith('\n') ? '\n' : ''}# AURA local paths (workspace/dev-workspace.ts)\n${missing.join('\n')}\n`);
}

export interface TaskWorktree {
  baseDir: string;
  workDir: string;
  branch: string;
  created: boolean;
}

// Idempotently creates a Task's worktree off the base HEAD, symlinking the base node_modules.
export async function ensureTaskWorktree(baseDir: string, taskKey: string): Promise<TaskWorktree> {
  const workDir = taskWorktreeDir(baseDir, taskKey);
  const branch = taskBranchName(taskKey);

  // A worktree's own working directory has a `.git` FILE (pointing back at the base repo's real
  // .git), not a `.git` directory - either way, its presence means the worktree already exists.
  await ensureAuraExcludes(baseDir);
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

// Finds a Task's worktree from its key alone; null before Gate 4 creates one.
export async function findTaskWorktree(taskKey: string): Promise<LocatedTaskWorktree | null> {
  const root = path.resolve(devWorkspaceRoot);
  const epics = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const epic of epics) {
    if (!epic.isDirectory()) continue;
    const devDir = path.join(root, epic.name, 'dev');
    const disciplines = await readdir(devDir, { withFileTypes: true }).catch(() => []);
    for (const discipline of disciplines) {
      // dev/.worktrees/ holds the Task worktrees, not a discipline.
      if (!discipline.isDirectory() || discipline.name.startsWith('.')) continue;
      const workDir = taskWorktreeDir(path.join(devDir, discipline.name), taskKey);
      if (await pathExists(path.join(workDir, '.git'))) {
        return { taskKey, epicKey: epic.name, discipline: discipline.name, path: workDir, branch: taskBranchName(taskKey) };
      }
    }
  }
  return null;
}
