import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Local git, always via execFile (argv, no shell) in a worktree path the API returned - the CLI
// never builds a shell string or guesses a path. Because this runs on the developer's machine,
// commits carry their own git identity and signing config, and pushes use their own
// credentials (SSH agent / credential helper / gh) - AURA never sees a GitHub credential.

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 32 * 1024 * 1024;

export async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: MAX_BUFFER });
    return stdout;
  } catch (error) {
    const e = error as { stderr?: string; message: string };
    throw new Error(`git ${args[0]} failed: ${(e.stderr || e.message).trim()}`);
  }
}

export async function gitConfigValue(key: string, cwd = process.cwd()): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["config", "--get", key], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync(command, ["--version"]);
    return true;
  } catch {
    return false;
  }
}

export async function run(command: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: MAX_BUFFER });
  return stdout;
}

// Commit trailers linking a developer-authored commit back to the AURA Task and run that
// produced it (docs/plans/aura-code-cli-council.md section 4.7).
export function auraTrailers(taskKey: string, draftId?: string): string[] {
  const trailers = ["Co-authored-by: AURA Coding Council <aura@localhost>", `AURA-Task: ${taskKey}`];
  if (draftId) trailers.push(`AURA-Run: ${draftId}`);
  return trailers;
}
