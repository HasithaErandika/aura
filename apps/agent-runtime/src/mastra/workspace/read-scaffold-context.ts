import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { devWorkspaceDir } from './dev-workspace';

// Gives the QA Agent (Gate 6) a real look at what Dev/Coding actually built, instead of writing
// Playwright source blind from Story text alone (docs/ARCHITECTURE.md's own documented gap: QA
// never read the scaffold). Best-effort and bounded: this is a text summary for a prompt, not a
// full repository read - it walks each scaffolded discipline's directory (skipping
// node_modules/.git/build output), and returns a capped excerpt of source files most likely to
// carry real routes/selectors (pages, routes, controllers, components), so QA can prefer real
// `data-testid`s and real URLs over guesses. Returns '' if nothing is scaffolded yet - QA still
// works from Stories alone in that case, exactly as it did before this change.

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'test-results', 'playwright-report']);
const RELEVANT_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js']);
// Files whose path contains one of these are prioritized - the ones most likely to define real
// routes, endpoints, or the data-testid attributes a Playwright selector should target.
const PRIORITY_HINTS = ['route', 'page', 'controller', 'app.module', 'app.tsx', 'app.jsx', 'main.tsx', 'component'];

const MAX_FILES = 12;
const MAX_CHARS_PER_FILE = 2000;
const MAX_TOTAL_CHARS = 16000;

async function walk(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (RELEVANT_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
}

function priorityScore(filePath: string): number {
  const lower = filePath.toLowerCase();
  return PRIORITY_HINTS.some((hint) => lower.includes(hint)) ? 0 : 1;
}

// Reads a bounded, prioritized excerpt of one discipline's scaffolded source, or null if that
// discipline hasn't been scaffolded (or has no source) yet.
async function readDisciplineContext(epicKey: string, discipline: 'Frontend' | 'Backend'): Promise<string | null> {
  const dir = await devWorkspaceDir(epicKey, discipline);
  const files: string[] = [];
  await walk(dir, files);
  if (files.length === 0) return null;

  files.sort((a, b) => priorityScore(a) - priorityScore(b) || a.localeCompare(b));

  const sections: string[] = [];
  let total = 0;
  for (const filePath of files.slice(0, MAX_FILES)) {
    let content: string;
    try {
      const stats = await stat(filePath);
      if (stats.size > 200_000) continue; // skip generated/bundled files, not hand-written source
      content = await readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    const excerpt = content.length > MAX_CHARS_PER_FILE ? `${content.slice(0, MAX_CHARS_PER_FILE)}\n... (truncated)` : content;
    if (total + excerpt.length > MAX_TOTAL_CHARS) break;
    total += excerpt.length;
    sections.push(`--- ${path.relative(dir, filePath)} ---\n${excerpt}`);
  }
  return sections.length ? sections.join('\n\n') : null;
}

// Reads whatever of Frontend/Backend is scaffolded for this Epic, labelled by discipline, for
// use as QA prompt context. Never throws - a read failure just means less context, not a
// blocked test plan.
export async function readScaffoldContext(epicKey: string): Promise<string> {
  const parts: string[] = [];
  for (const discipline of ['Frontend', 'Backend'] as const) {
    const context = await readDisciplineContext(epicKey, discipline);
    if (context) parts.push(`## ${discipline} source (as scaffolded/implemented so far)\n\n${context}`);
  }
  return parts.join('\n\n');
}
