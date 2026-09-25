import { mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Local CLI state: which API to talk to, the personal access token, and which Orchestrator
// thread belongs to which Task (so `aura code` / `aura approve` keep one conversation per Task).
// Stored at $XDG_CONFIG_HOME/aura/config.json (default ~/.config/aura), file mode 0600 - it holds
// a bearer token.

export interface TaskState {
  threadId: string;
  lastApprovalId?: string;
  lastDraftId?: string;
}

export interface CliConfig {
  apiUrl: string;
  token: string;
  tasks: Record<string, TaskState>;
}

export const DEFAULT_API_URL = "http://localhost:4000";

export function configPath(): string {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "aura", "config.json");
}

// The file as stored - it may hold per-Task state without a login (a web-terminal session signs
// in through AURA_TOKEN and still remembers Task state here).
async function loadRaw(): Promise<Partial<CliConfig> | null> {
  try {
    return JSON.parse(await readFile(configPath(), "utf8")) as Partial<CliConfig>;
  } catch {
    return null;
  }
}

export async function loadConfig(): Promise<CliConfig | null> {
  const parsed = await loadRaw();
  if (!parsed?.apiUrl || !parsed.token) return null;
  return { apiUrl: parsed.apiUrl, token: parsed.token, tasks: parsed.tasks ?? {} };
}

export async function saveConfig(config: CliConfig): Promise<void> {
  const file = configPath();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  // writeFile's mode only applies when the file is created; enforce it on existing files too.
  await chmod(file, 0o600);
}

export async function deleteConfig(): Promise<void> {
  await rm(configPath(), { force: true });
}

export async function requireConfig(): Promise<CliConfig> {
  // AURA_TOKEN / AURA_API_URL let the web terminal (signed in automatically), CI, or a one-off
  // shell use the CLI without `aura login`.
  const envToken = process.env.AURA_TOKEN;
  if (envToken) {
    const raw = await loadRaw();
    return { apiUrl: process.env.AURA_API_URL || raw?.apiUrl || DEFAULT_API_URL, token: envToken, tasks: raw?.tasks ?? {} };
  }
  const stored = await loadConfig();
  if (!stored) throw new Error("Not logged in. Create a token on the web Profile page, then run `aura login`.");
  return stored;
}

export async function updateTaskState(config: CliConfig, taskKey: string, patch: Partial<TaskState>): Promise<void> {
  const next = { ...config.tasks[taskKey], ...patch } as TaskState;
  if (!next.threadId) return;
  config.tasks[taskKey] = next;
  // Never writes an env-var token (AURA_TOKEN) to disk - only the Task state, next to whatever
  // login is already stored (possibly none).
  const raw = (await loadRaw()) ?? {};
  await saveConfig({ apiUrl: raw.apiUrl ?? config.apiUrl, token: raw.token ?? "", tasks: { ...(raw.tasks ?? {}), [taskKey]: next } });
}
