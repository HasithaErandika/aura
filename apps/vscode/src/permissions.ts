import { READ_ONLY_OPS, type BridgeArgs, type BridgeOp } from "@aura/bridge";

// What the extension does with each request an agent makes (ADR-4 D10, plan §6), Claude-Code
// style: allow, ask the developer, or deny.
//
//   1. Built-in denies: never run, whatever any rule or answer says.
//   2. Project rules (.aura/settings.json, .aura/settings.local.json): deny, then ask, then allow.
//   3. The mode: plan (read-only), default (ask), acceptEdits (file changes allowed).
//   4. Built-in allows: reads and the project's own checks.
//   5. Everything else asks.
//
// "Allow for this session" remembers one exact command or one file; "Allow for this project"
// turns it into a rule in .aura/settings.local.json.

export type Decision = { kind: "allow"; reason: string } | { kind: "ask"; reason: string } | { kind: "deny"; reason: string };

export const MODES = ["plan", "default", "acceptEdits"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = {
  plan: "Plan (read-only)",
  default: "Default (ask before changes)",
  acceptEdits: "Accept edits (file changes in this folder allowed)",
};

// Rules as written in .aura/settings.json: "Bash(npm run e2e)" (exactly this command),
// "Bash(npm run e2e:*)" (this command with any arguments), "Edit(src/**)" (changing these files),
// "Read(.env*)" (reading these files).
export interface PermissionRules {
  allow: string[];
  ask: string[];
  deny: string[];
}

export const NO_RULES: PermissionRules = { allow: [], ask: [], deny: [] };

// Never run, whatever the developer chose before. Matched against the full command line.
const DENY: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bgit\s+push\b[^\n]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/i, reason: "force pushes are never allowed" },
  { pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b[^\n]*\s(\/|~|\$HOME|\.\.)(\s|\/|$)/i, reason: "recursive deletes outside the workspace are never allowed" },
  { pattern: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/i, reason: "piping a download into a shell is never allowed" },
  { pattern: /(~|\$HOME|\/home\/[^/\s]+|\/Users\/[^/\s]+)\/\.(ssh|aws|gnupg|kube|docker|config\/gh|netrc|npmrc|git-credentials)\b/i, reason: "reading credentials is never allowed" },
  { pattern: /\bsudo\b/i, reason: "sudo is never allowed" },
  { pattern: /\b(mkfs(\.\w+)?|shutdown|reboot|halt)\b|\bdd\s+[^\n]*of=\/dev\//i, reason: "system commands are never allowed" },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\};:/, reason: "fork bombs are never allowed" },
  { pattern: /\bchmod\s+-R\s+777\s+\//i, reason: "changing permissions outside the workspace is never allowed" },
];

// Run without asking: read-only commands and the project's own checks. Only when the command
// line has no chaining, redirection or substitution, so "npm test && rm -rf src" is never allowed.
const ALLOW: RegExp[] = [
  /^git\s+(status|diff|log|show|branch|rev-parse|ls-files)(\s|$)/,
  /^(ls|pwd|whoami|date)(\s|$)/,
  /^(node|npm|pnpm|yarn|npx|git|tsc)\s+(-v|--version)$/,
  /^(npm|pnpm|yarn)\s+(test|run\s+(test|lint|typecheck|check|build)(:\S+)?)(\s+--\s+[\w\s=./:-]*)?$/,
  /^(npm|pnpm|yarn)\s+(ls|list|outdated)(\s|$)/,
  /^npx\s+(tsc\s+--noEmit|vitest\s+run|eslint|prettier\s+--check)(\s|$)/,
];

const SHELL_META = /[;&|`$<>(){}\\]|\n/;

const COMMAND_OPS: readonly BridgeOp[] = ["sandbox.exec", "proc.spawn"];

export function commandLine(args: BridgeArgs<"sandbox.exec"> | BridgeArgs<"proc.spawn">): string {
  return [args.command, ...(("args" in args && args.args) || [])].join(" ").trim();
}

// The files a request changes or reads (for Edit/Read rules and "allow for this session").
export function targetPaths(op: BridgeOp, args: unknown): string[] {
  const a = args as { path?: string; src?: string; dest?: string };
  if (op === "fs.moveFile") return [a.src ?? "", a.dest ?? ""];
  if (op === "fs.copyFile") return [a.dest ?? ""];
  return [normalize(a.path ?? "")];
}

function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "") || ".";
}

// "src/**/*.ts" → regex. ** spans folders, * and ? stay within one.
export function globToRegExp(glob: string): RegExp {
  let out = "";
  const g = normalize(glob);
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!;
    if (c === "*" && g[i + 1] === "*") {
      out += g[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += g[i + 2] === "/" ? 2 : 1;
    } else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

type ParsedRule = { tool: "Bash"; command: string; prefix: boolean } | { tool: "Edit" | "Read"; path: RegExp };

export function parseRule(rule: string): ParsedRule | null {
  const m = /^(Bash|Edit|Read)\((.+)\)$/.exec(rule.trim());
  if (!m) return null;
  const [, tool, body] = m as unknown as [string, "Bash" | "Edit" | "Read", string];
  if (tool === "Bash") return body.endsWith(":*") ? { tool, command: body.slice(0, -2).trim(), prefix: true } : { tool, command: body.trim(), prefix: false };
  return { tool, path: globToRegExp(body) };
}

function ruleMatches(rule: ParsedRule, op: BridgeOp, args: unknown): boolean {
  if (rule.tool === "Bash") {
    if (!COMMAND_OPS.includes(op)) return false;
    const line = commandLine(args as BridgeArgs<"sandbox.exec">);
    if (!rule.prefix) return line === rule.command;
    // A prefix rule never covers a chained command: "npm test:*" doesn't allow "npm test; rm -rf".
    return !SHELL_META.test(line) && (line === rule.command || line.startsWith(`${rule.command} `));
  }
  const reading = READ_ONLY_OPS.includes(op);
  if (rule.tool === "Read" ? !reading || !op.startsWith("fs.") : reading || COMMAND_OPS.includes(op) || !op.startsWith("fs.")) return false;
  return targetPaths(op, args).some((p) => rule.path.test(p));
}

export class PermissionPolicy {
  private readonly sessionCommands = new Set<string>();
  private readonly sessionWrites = new Set<string>();
  private rules: { allow: ParsedRule[]; ask: ParsedRule[]; deny: ParsedRule[] } = { allow: [], ask: [], deny: [] };
  mode: Mode = "default";

  // Rules from the project's settings files. Unreadable rules are skipped (and reported by the caller).
  setRules(rules: PermissionRules): string[] {
    const invalid: string[] = [];
    const parse = (list: string[]) =>
      list.flatMap((r) => {
        const parsed = parseRule(r);
        if (!parsed) invalid.push(r);
        return parsed ? [parsed] : [];
      });
    this.rules = { allow: parse(rules.allow), ask: parse(rules.ask), deny: parse(rules.deny) };
    return invalid;
  }

  decide<O extends BridgeOp>(op: O, args: BridgeArgs<O>): Decision {
    const matches = (list: ParsedRule[]) => list.some((r) => ruleMatches(r, op, args));

    if (READ_ONLY_OPS.includes(op)) {
      if (matches(this.rules.deny)) return { kind: "deny", reason: "the project's rules don't allow reading this" };
      return { kind: "allow", reason: "reading is allowed" };
    }
    // Only processes this window started can be stopped.
    if (op === "proc.kill") return { kind: "allow", reason: "stopping a background process" };

    if (COMMAND_OPS.includes(op)) {
      const line = commandLine(args as BridgeArgs<"sandbox.exec">);
      const denied = DENY.find((d) => d.pattern.test(line));
      if (denied) return { kind: "deny", reason: denied.reason };
      if (matches(this.rules.deny)) return { kind: "deny", reason: "the project's rules don't allow this command" };
      const builtIn = !SHELL_META.test(line) && ALLOW.some((p) => p.test(line));
      if (this.mode === "plan") return builtIn ? { kind: "allow", reason: "read-only command or project check" } : { kind: "deny", reason: "plan mode is read-only: propose the change in your plan instead" };
      if (this.sessionCommands.has(line)) return { kind: "allow", reason: "allowed for this session" };
      if (matches(this.rules.ask)) return { kind: "ask", reason: "the project's rules ask for this command" };
      if (matches(this.rules.allow)) return { kind: "allow", reason: "allowed by the project's rules" };
      if (builtIn) return { kind: "allow", reason: "read-only command or project check" };
      return { kind: "ask", reason: SHELL_META.test(line) ? "chained or redirected command" : "command" };
    }

    if (matches(this.rules.deny)) return { kind: "deny", reason: "the project's rules don't allow changing this file" };
    if (this.mode === "plan") return { kind: "deny", reason: "plan mode is read-only: propose the change in your plan instead" };
    if (targetPaths(op, args).every((p) => this.sessionWrites.has(p))) return { kind: "allow", reason: "allowed for this session" };
    if (matches(this.rules.ask)) return { kind: "ask", reason: "the project's rules ask for this file" };
    if (matches(this.rules.allow)) return { kind: "allow", reason: "allowed by the project's rules" };
    if (this.mode === "acceptEdits") return { kind: "allow", reason: "accept-edits mode" };
    return { kind: "ask", reason: "changes files" };
  }

  // "Allow for this session": exactly this command, or changes to exactly these files.
  rememberForSession<O extends BridgeOp>(op: O, args: BridgeArgs<O>): void {
    if (COMMAND_OPS.includes(op)) this.sessionCommands.add(commandLine(args as BridgeArgs<"sandbox.exec">));
    else for (const p of targetPaths(op, args)) this.sessionWrites.add(p);
  }

  reset(): void {
    this.sessionCommands.clear();
    this.sessionWrites.clear();
  }
}

// "Allow for this project": the rule that allows exactly this request from now on.
export function ruleFor<O extends BridgeOp>(op: O, args: BridgeArgs<O>): string {
  if (COMMAND_OPS.includes(op)) return `Bash(${commandLine(args as BridgeArgs<"sandbox.exec">)})`;
  return `Edit(${targetPaths(op, args).at(-1)})`;
}

// The one-line question shown to the developer.
export function describeRequest<O extends BridgeOp>(op: O, args: BridgeArgs<O>): string {
  const a = args as Record<string, unknown>;
  switch (op) {
    case "sandbox.exec":
      return `Run: ${commandLine(args as BridgeArgs<"sandbox.exec">)}${a.cwd ? `  (in ${String(a.cwd)})` : ""}`;
    case "proc.spawn":
      return `Start in the background: ${String(a.command)}${a.cwd ? `  (in ${String(a.cwd)})` : ""}`;
    case "proc.kill":
      return `Stop background process ${String(a.pid)}`;
    case "fs.writeFile":
      return `Write file: ${String(a.path)}`;
    case "fs.appendFile":
      return `Append to: ${String(a.path)}`;
    case "fs.deleteFile":
      return `Delete file: ${String(a.path)}`;
    case "fs.rmdir":
      return `Delete folder: ${String(a.path)}${a.recursive ? " (and everything in it)" : ""}`;
    case "fs.mkdir":
      return `Create folder: ${String(a.path)}`;
    case "fs.copyFile":
      return `Copy ${String(a.src)} → ${String(a.dest)}`;
    case "fs.moveFile":
      return `Move ${String(a.src)} → ${String(a.dest)}`;
    case "fs.grep":
      return `Search for /${String(a.pattern)}/ in ${String(a.path)}`;
    default:
      return `${op} ${String(a.path ?? a.pid ?? "")}`;
  }
}
