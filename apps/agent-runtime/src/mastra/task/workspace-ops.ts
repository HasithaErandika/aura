import type { BridgeCaller } from '../bridge/client';
import type { ChangedFile, CheckResult } from './contracts';

// What the Task loop does on the developer's machine itself, through the bridge (so the
// extension's permission rules still apply): run the checks, read the change, read the
// project's settings. Code, not a model, runs these, so their results are real.

const CHECK_TIMEOUT_MS = 10 * 60_000;
const OUTPUT_TAIL = 4000;
const MAX_DIFF = 60_000;

function tail(text: string, max = OUTPUT_TAIL): string {
  return text.length > max ? `…${text.slice(-max)}` : text;
}

export async function runChecks(bridge: BridgeCaller, commands: string[]): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const command of commands) {
    try {
      const r = await bridge.call('sandbox.exec', { command, timeoutMs: CHECK_TIMEOUT_MS }, CHECK_TIMEOUT_MS + 5000);
      results.push({ command, exitCode: r.exitCode, passed: r.exitCode === 0 && !r.timedOut, output: tail(`${r.stdout}\n${r.stderr}`.trim()) });
    } catch (error) {
      results.push({ command, exitCode: -1, passed: false, output: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

// `git status --porcelain` lines → changed files. Renames report their new path.
export function parsePorcelain(text: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of text.split('\n')) {
    if (line.length < 4) continue;
    const code = line.slice(0, 2);
    let path = line.slice(3).trim();
    if (path.includes(' -> ')) path = path.split(' -> ')[1]!.trim();
    path = path.replace(/^"|"$/g, '');
    const status: ChangedFile['status'] = code === '??' ? 'untracked' : code.includes('R') ? 'renamed' : code.includes('A') ? 'added' : code.includes('D') ? 'deleted' : 'modified';
    files.push({ path, status });
  }
  return files;
}

export interface WorkingChange {
  files: ChangedFile[];
  diff: string;
  diffStat: string;
}

// The change against the last commit, plus new files (which `git diff` leaves out).
export async function collectChange(bridge: BridgeCaller): Promise<WorkingChange> {
  const exec = (command: string) => bridge.call('sandbox.exec', { command, timeoutMs: 60_000 }).then((r) => r.stdout);
  const [status, diff, diffStat] = await Promise.all([exec('git status --porcelain'), exec('git diff HEAD'), exec('git diff HEAD --stat')]);
  const files = parsePorcelain(status);
  let combined = diff;
  for (const f of files.filter((x) => x.status === 'untracked').slice(0, 20)) {
    if (combined.length > MAX_DIFF) break;
    const content = await bridge.call('fs.readFile', { path: f.path, encoding: 'utf8' }).then((r) => r.content).catch(() => '(unreadable)');
    combined += `\n--- /dev/null\n+++ b/${f.path} (new file)\n${content.split('\n').map((l) => `+${l}`).join('\n')}`;
  }
  return { files, diff: combined.length > MAX_DIFF ? `${combined.slice(0, MAX_DIFF)}\n…(diff truncated)` : combined, diffStat };
}

// The project's own check commands (.aura/settings.json "checks"), which win over the plan's:
// the team decides what proves a change, not the agent.
export async function projectChecks(bridge: BridgeCaller): Promise<string[] | null> {
  const parse = (text: string): string[] | null => {
    try {
      const checks = (JSON.parse(text) as { checks?: unknown }).checks;
      return Array.isArray(checks) ? checks.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).slice(0, 10) : null;
    } catch {
      return null;
    }
  };
  for (const path of ['.aura/settings.local.json', '.aura/settings.json']) {
    const text = await bridge.call('fs.readFile', { path, encoding: 'utf8' }).then((r) => r.content).catch(() => null);
    const checks = text ? parse(text) : null;
    if (checks?.length) return checks;
  }
  return null;
}

// Notes the developer typed while the Task runs (apps/api GET /internal/runs/:id/notes).
export async function takeNotes(runId: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const token = process.env.MASTRA_RUNTIME_TOKEN?.trim();
  const base = (process.env.AURA_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  try {
    const res = await fetchImpl(`${base}/internal/runs/${encodeURIComponent(runId)}/notes`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return [];
    return ((await res.json()) as { notes: { text: string }[] }).notes.map((n) => n.text);
  } catch {
    return [];
  }
}
