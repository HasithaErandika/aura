import { AuraApiError, createAuraClient, type AuraClient, type TaskWorktree } from "@aura/client";
import { requireConfig, type CliConfig } from "./config.js";
import { git } from "./git.js";

export interface Session {
  config: CliConfig;
  client: AuraClient;
}

export async function session(): Promise<Session> {
  const config = await requireConfig();
  return { config, client: createAuraClient({ baseUrl: config.apiUrl, token: config.token }) };
}

const TASK_KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export function normalizeTaskKey(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!TASK_KEY.test(key)) throw new Error(`"${raw}" is not a Jira issue key (expected something like KAN-45)`);
  return key;
}

// When no Task is given, use the one whose worktree the shell is in: every Task worktree is
// checked out on feature/<TASK> (agent-runtime workspace/dev-workspace.ts taskBranchName).
export async function taskFromCwd(): Promise<string | null> {
  try {
    const branch = (await git(process.cwd(), ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    const match = /^feature\/([A-Z][A-Z0-9]+-\d+)$/.exec(branch);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function resolveTask(arg: string | undefined): Promise<string> {
  if (arg) return normalizeTaskKey(arg);
  const fromCwd = await taskFromCwd();
  if (fromCwd) return fromCwd;
  throw new Error("No Task given, and this directory is not an AURA Task worktree. Pass a Task key, e.g. `aura code KAN-45`.");
}

// null when the Task has no worktree yet (Gate 4 not approved); other errors propagate.
export async function findWorktree(client: AuraClient, taskKey: string): Promise<TaskWorktree | null> {
  try {
    return await client.devWorkspace.findTask(taskKey);
  } catch (error) {
    if (error instanceof AuraApiError && error.status === 404) return null;
    throw error;
  }
}

export async function requireWorktree(client: AuraClient, taskKey: string): Promise<TaskWorktree> {
  const worktree = await findWorktree(client, taskKey);
  if (!worktree) throw new Error(`${taskKey} has no worktree yet. Run \`aura code ${taskKey} --epic <EPIC>\` to draft its scaffold (Gate 4) first.`);
  return worktree;
}
