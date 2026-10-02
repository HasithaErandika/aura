import { MODES, NO_RULES, type Mode, type PermissionRules } from "./permissions.js";

// The project's AURA settings (plan §6), Claude-Code style:
//   .aura/settings.json        committed, shared by the team
//   .aura/settings.local.json  this developer only, git-ignored ("Allow for this project" writes here)
//
// {
//   "defaultMode": "default",
//   "permissions": { "allow": ["Bash(npm run e2e)"], "ask": ["Edit(package.json)"], "deny": ["Read(.env*)"] },
//   "hooks": { "afterEdit": ["npx prettier --write {file}"], "beforeCommit": ["npm run lint"] }
// }
//
// Pure: no VS Code API, so it is tested directly.

export const SETTINGS_FILE = ".aura/settings.json";
export const LOCAL_SETTINGS_FILE = ".aura/settings.local.json";

export interface Hooks {
  // After a file change succeeds; {file} is replaced with the changed file's path.
  afterEdit: string[];
  // Before a `git commit` runs; a failing hook stops the commit and the agent is told why.
  beforeCommit: string[];
}

export interface ProjectSettings {
  defaultMode: Mode | null;
  permissions: PermissionRules;
  hooks: Hooks;
  // Problems found while reading, shown in the AURA output.
  problems: string[];
}

export const EMPTY_SETTINGS: ProjectSettings = { defaultMode: null, permissions: NO_RULES, hooks: { afterEdit: [], beforeCommit: [] }, problems: [] };

function strings(value: unknown, where: string, problems: string[]): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    problems.push(`${where} must be a list of strings`);
    return [];
  }
  return (value as string[]).map((v) => v.trim()).filter(Boolean);
}

// One settings file's text → settings. A file that doesn't parse contributes nothing.
export function parseSettings(text: string | null, file: string): ProjectSettings {
  if (text === null || !text.trim()) return { ...EMPTY_SETTINGS, problems: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ...EMPTY_SETTINGS, problems: [`${file}: not valid JSON (${(error as Error).message})`] };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ...EMPTY_SETTINGS, problems: [`${file}: must be a JSON object`] };
  const r = raw as { defaultMode?: unknown; permissions?: Record<string, unknown>; hooks?: Record<string, unknown> };
  const problems: string[] = [];
  const defaultMode = typeof r.defaultMode === "string" && (MODES as readonly string[]).includes(r.defaultMode) ? (r.defaultMode as Mode) : null;
  if (r.defaultMode !== undefined && !defaultMode) problems.push(`${file}: defaultMode must be one of ${MODES.join(", ")}`);
  const p = r.permissions ?? {};
  const h = r.hooks ?? {};
  return {
    defaultMode,
    permissions: { allow: strings(p.allow, `${file} permissions.allow`, problems), ask: strings(p.ask, `${file} permissions.ask`, problems), deny: strings(p.deny, `${file} permissions.deny`, problems) },
    hooks: { afterEdit: strings(h.afterEdit, `${file} hooks.afterEdit`, problems), beforeCommit: strings(h.beforeCommit, `${file} hooks.beforeCommit`, problems) },
    problems,
  };
}

// Shared settings plus the developer's own: lists are combined, the local default mode wins.
export function mergeSettings(shared: ProjectSettings, local: ProjectSettings): ProjectSettings {
  return {
    defaultMode: local.defaultMode ?? shared.defaultMode,
    permissions: {
      allow: [...shared.permissions.allow, ...local.permissions.allow],
      ask: [...shared.permissions.ask, ...local.permissions.ask],
      deny: [...shared.permissions.deny, ...local.permissions.deny],
    },
    hooks: { afterEdit: [...shared.hooks.afterEdit, ...local.hooks.afterEdit], beforeCommit: [...shared.hooks.beforeCommit, ...local.hooks.beforeCommit] },
    problems: [...shared.problems, ...local.problems],
  };
}

// settings.local.json with one more allow rule (kept once), formatted for people to read.
export function withAllowRule(localText: string | null, rule: string): string {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = localText?.trim() ? JSON.parse(localText) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
  } catch {
    // An unreadable local file is replaced; it is the developer's own and only holds rules.
  }
  const permissions = (raw.permissions && typeof raw.permissions === "object" ? raw.permissions : {}) as Record<string, unknown>;
  const allow = Array.isArray(permissions.allow) ? (permissions.allow as unknown[]).filter((v): v is string => typeof v === "string") : [];
  if (!allow.includes(rule)) allow.push(rule);
  return `${JSON.stringify({ ...raw, permissions: { ...permissions, allow } }, null, 2)}\n`;
}

// Whether the developer's mode is allowed by the project (Admin → Settings: vscode.permissionModes).
export function allowedModes(setting: unknown): Mode[] {
  if (setting === "plan-only") return ["plan"];
  if (setting === "no-accept-edits") return ["plan", "default"];
  return [...MODES];
}
