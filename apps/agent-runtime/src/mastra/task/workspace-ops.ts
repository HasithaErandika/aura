import type { BridgeCaller } from '../bridge/client';
import { auraApiHeaders, auraApiUrl } from '../lib/aura-api';
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

// `git diff --name-status` lines → changed files (renames and copies report their new path).
export function parseNameStatus(text: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  for (const line of text.split('\n')) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const code = parts[0]!.trim();
    const path = parts.at(-1)!.trim();
    const status: ChangedFile['status'] = code.startsWith('R') || code.startsWith('C') ? 'renamed' : code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified';
    files.push({ path, status });
  }
  return files;
}

// A worktree links the main folder's node_modules (task/git-ops.ts); it is never part of a change.
const NEVER_CHANGED = new Set(['node_modules']);

// The change against `base` (default: the last commit), committed or not, plus new files (which
// `git diff` leaves out).
export async function collectChange(bridge: BridgeCaller, base = 'HEAD'): Promise<WorkingChange> {
  if (!/^[\w./-]+$/.test(base)) throw new Error(`invalid base ref ${base}`);
  const exec = (command: string) => bridge.call('sandbox.exec', { command, timeoutMs: 60_000 }).then((r) => r.stdout);
  const [nameStatus, others, diff, diffStat] = await Promise.all([
    exec(`git diff --name-status ${base}`),
    exec('git ls-files --others --exclude-standard'),
    exec(`git diff ${base}`),
    exec(`git diff ${base} --stat`),
  ]);
  const untracked: ChangedFile[] = others.split('\n').map((l) => l.trim()).filter(Boolean).map((path) => ({ path, status: 'untracked' }));
  const files = [...parseNameStatus(nameStatus), ...untracked].filter((f) => !NEVER_CHANGED.has(f.path));
  let combined = diff;
  for (const f of files.filter((x) => x.status === 'untracked').slice(0, 20)) {
    if (combined.length > MAX_DIFF) break;
    const content = await bridge.call('fs.readFile', { path: f.path, encoding: 'utf8' }).then((r) => r.content).catch(() => '(unreadable)');
    combined += `\n--- /dev/null\n+++ b/${f.path} (new file)\n${content.split('\n').map((l) => `+${l}`).join('\n')}`;
  }
  return { files, diff: combined.length > MAX_DIFF ? `${combined.slice(0, MAX_DIFF)}\n…(diff truncated)` : combined, diffStat };
}

// A list setting from the project's .aura/settings.local.json, else .aura/settings.json.
async function projectList(bridge: BridgeCaller, key: 'checks' | 'reviewers'): Promise<string[] | null> {
  const parse = (text: string): string[] | null => {
    try {
      const value = (JSON.parse(text) as Record<string, unknown>)[key];
      return Array.isArray(value) ? value.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).slice(0, key === 'checks' ? 10 : 15) : null;
    } catch {
      return null;
    }
  };
  for (const path of ['.aura/settings.local.json', '.aura/settings.json']) {
    const text = await bridge.call('fs.readFile', { path, encoding: 'utf8' }).then((r) => r.content).catch(() => null);
    const list = text ? parse(text) : null;
    if (list?.length) return list;
  }
  return null;
}

// The project's own check commands (.aura/settings.json "checks"), which win over the plan's:
// the team decides what proves a change, not the agent.
export function projectChecks(bridge: BridgeCaller): Promise<string[] | null> {
  return projectList(bridge, 'checks');
}

// The project's default pull request reviewers (.aura/settings.json "reviewers", GitHub logins
// or org/team).
export function projectReviewers(bridge: BridgeCaller): Promise<string[] | null> {
  return projectList(bridge, 'reviewers');
}

// Notes the developer typed while the Task runs (apps/api GET /internal/runs/:id/notes).
export async function takeNotes(runId: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  try {
    const res = await fetchImpl(`${auraApiUrl()}/internal/runs/${encodeURIComponent(runId)}/notes`, { headers: auraApiHeaders(false) });
    if (!res.ok) return [];
    return ((await res.json()) as { notes: { text: string }[] }).notes.map((n) => n.text);
  } catch {
    return [];
  }
}
