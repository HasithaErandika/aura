import { READ_ONLY_OPS, type BridgeArgs, type BridgeOp } from "@aura/bridge";

// What the extension does with each request an agent makes (ADR-4 D10, plan §6), Claude-Code
// style: allow, ask the developer, or deny. Built-in denies can't be overridden; "Allow for this
// session" only ever remembers one exact command or one write target.

export type Decision = { kind: "allow"; reason: string } | { kind: "ask"; reason: string } | { kind: "deny"; reason: string };

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

export function commandLine(args: BridgeArgs<"sandbox.exec">): string {
  return [args.command, ...(args.args ?? [])].join(" ").trim();
}

export class PermissionPolicy {
  private readonly sessionCommands = new Set<string>();
  private readonly sessionWrites = new Set<string>();

  decide<O extends BridgeOp>(op: O, args: BridgeArgs<O>): Decision {
    if (READ_ONLY_OPS.includes(op)) return { kind: "allow", reason: "reading files is allowed" };

    if (op === "sandbox.exec") {
      const line = commandLine(args as BridgeArgs<"sandbox.exec">);
      const denied = DENY.find((d) => d.pattern.test(line));
      if (denied) return { kind: "deny", reason: denied.reason };
      if (this.sessionCommands.has(line)) return { kind: "allow", reason: "allowed for this session" };
      if (!SHELL_META.test(line) && ALLOW.some((p) => p.test(line))) return { kind: "allow", reason: "read-only command or project check" };
      return { kind: "ask", reason: SHELL_META.test(line) ? "chained or redirected command" : "command" };
    }

    if (this.sessionWrites.has(writeTarget(op, args))) return { kind: "allow", reason: "allowed for this session" };
    return { kind: "ask", reason: "changes files" };
  }

  // "Allow for this session": exactly this command, or writes to exactly this file.
  rememberForSession<O extends BridgeOp>(op: O, args: BridgeArgs<O>): void {
    if (op === "sandbox.exec") this.sessionCommands.add(commandLine(args as BridgeArgs<"sandbox.exec">));
    else this.sessionWrites.add(writeTarget(op, args));
  }

  reset(): void {
    this.sessionCommands.clear();
    this.sessionWrites.clear();
  }
}

function writeTarget(op: BridgeOp, args: unknown): string {
  const a = args as { path?: string; dest?: string };
  return `${op}:${a.dest ?? a.path ?? ""}`;
}

// The one-line question shown to the developer.
export function describeRequest<O extends BridgeOp>(op: O, args: BridgeArgs<O>): string {
  const a = args as Record<string, unknown>;
  switch (op) {
    case "sandbox.exec":
      return `Run: ${commandLine(args as BridgeArgs<"sandbox.exec">)}${a.cwd ? `  (in ${String(a.cwd)})` : ""}`;
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
    default:
      return `${op} ${String(a.path ?? "")}`;
  }
}
