import type { BridgeOp, BridgeArgs } from "@aura/bridge";
import { commandLine, targetPaths } from "./permissions.js";
import type { Hooks } from "./project-settings.js";

// Hooks from .aura/settings.json, run by the extension, never by the model (plan §6). They run
// in the workspace like any command (built-in denies still apply) and their output goes to the
// AURA output channel.

export interface HookRunner {
  // Runs one hook command line; resolves with its exit code and output.
  (command: string): Promise<{ exitCode: number; output: string }>;
}

const WRITE_OPS: readonly BridgeOp[] = ["fs.writeFile", "fs.appendFile", "fs.copyFile", "fs.moveFile"];

function quote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function isCommit(op: BridgeOp, args: unknown): boolean {
  return op === "sandbox.exec" && /^git\s+commit(\s|$)/.test(commandLine(args as BridgeArgs<"sandbox.exec">));
}

// The afterEdit commands for one successful change, with {file} filled in.
export function afterEditCommands(hooks: Hooks, op: BridgeOp, args: unknown): string[] {
  if (!WRITE_OPS.includes(op) || !hooks.afterEdit.length) return [];
  const file = targetPaths(op, args).at(-1)!;
  return hooks.afterEdit.map((h) => h.replace(/\{file\}/g, quote(file)));
}

// beforeCommit: every hook must pass; the first failure is the reason the commit is refused.
export async function runBeforeCommit(hooks: Hooks, run: HookRunner): Promise<{ ok: true } | { ok: false; message: string }> {
  for (const hook of hooks.beforeCommit) {
    const r = await run(hook);
    if (r.exitCode !== 0) return { ok: false, message: `The project's beforeCommit hook \`${hook}\` failed (exit ${r.exitCode}), so the commit didn't run. Fix this first:\n${r.output.slice(-4000)}` };
  }
  return { ok: true };
}
