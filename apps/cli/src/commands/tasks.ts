import { spawn } from "node:child_process";
import { AuraApiError } from "@aura/client";
import { findWorktree, normalizeTaskKey, requireWorktree, resolveTask, session, taskFromCwd } from "../context.js";
import { commandExists } from "../git.js";
import { c, json, out, statusColor } from "../ui.js";

export async function tasks(opts: { epic?: string; json?: boolean }): Promise<void> {
  const { client } = await session();
  let epicKey = opts.epic ? normalizeTaskKey(opts.epic) : null;
  if (!epicKey) {
    const task = await taskFromCwd();
    if (task) epicKey = (await findWorktree(client, task))?.epicKey ?? null;
  }
  if (!epicKey) throw new Error("Pass --epic <KEY> (or run this inside a Task worktree).");

  const detail = await client.jira.epic(epicKey);
  if (opts.json) return json(detail);
  out(`${c.bold(detail.epic.key)} ${detail.epic.summary} ${c.gray(`· ${detail.epic.status}`)}`);
  out();
  const rows = [...detail.tasks, ...detail.bugs];
  if (rows.length === 0) {
    out(c.gray("No Tasks under this Epic yet."));
    return;
  }
  const keyWidth = Math.max(...rows.map((t) => t.key.length));
  const statusWidth = Math.max(...rows.map((t) => t.status.length));
  for (const t of rows) {
    const type = t.issueType.toLowerCase() === "bug" ? c.red(" bug") : "";
    out(`${c.bold(t.key.padEnd(keyWidth))}  ${statusColor(t.status.padEnd(statusWidth))}  ${t.summary}${type}`);
  }
}

export async function open(taskArg: string | undefined, opts: { code?: boolean; path?: boolean; json?: boolean }): Promise<void> {
  const { client } = await session();
  const taskKey = await resolveTask(taskArg);
  const worktree = await requireWorktree(client, taskKey);

  if (opts.json) return json(worktree);
  // `cd "$(aura open KAN-45 --path)"`
  if (opts.path) return out(worktree.path);

  out(`${c.bold(taskKey)} ${c.gray(`· ${worktree.epicKey} · ${worktree.discipline}`)}`);
  out(`branch   ${worktree.branch}`);
  out(`path     ${worktree.path}`);
  if (!opts.code) {
    out();
    out(c.gray(`cd "$(aura open ${taskKey} --path)"   or   aura open ${taskKey} --code`));
    return;
  }
  if (!(await commandExists("code"))) throw new Error("The `code` command is not on your PATH - in VS Code run “Shell Command: Install 'code' command in PATH”.");
  spawn("code", [worktree.path], { detached: true, stdio: "ignore" }).unref();
  out(`${c.green("✓")} Opened in VS Code`);
}

export async function status(taskArg: string | undefined, opts: { json?: boolean }): Promise<void> {
  const { client, config } = await session();
  const taskKey = taskArg ? normalizeTaskKey(taskArg) : await taskFromCwd();
  const approvals = await client.approvals.list(["PENDING"]);
  const usage = await client.council.usage().catch((error: unknown) => {
    if (error instanceof AuraApiError && (error.status === 404 || error.status === 503)) return null;
    throw error;
  });

  if (opts.json) return json({ taskKey, task: taskKey ? config.tasks[taskKey] ?? null : null, approvals, usage });

  if (taskKey) {
    const state = config.tasks[taskKey];
    out(`${c.bold(taskKey)} ${state ? c.gray(`thread ${state.threadId}${state.lastDraftId ? ` · draft ${state.lastDraftId}` : ""}`) : c.gray("no CLI conversation yet")}`);
    out();
  }

  out(c.bold("Pending gates"));
  const mine = approvals.filter((a) => a.canDecide);
  if (approvals.length === 0) out(c.gray("  none"));
  for (const a of approvals) {
    const gate = a.gate ? `Gate ${a.gate.number} · ${a.gate.name}` : a.producingAgent ?? "question";
    out(`  ${a.canDecide ? c.yellow("●") : c.gray("○")} ${gate}  ${c.gray(a.id)}`);
    out(c.gray(`    ${a.question.split("\n")[0]!.slice(0, 110)}`));
  }
  if (mine.length > 0) out(c.gray(`\n  ${mine.length} waiting on you - \`aura approve <id>\``));

  if (usage) {
    out();
    out(c.bold(`Model usage today (${usage.date})`));
    for (const [provider, u] of Object.entries(usage.providers)) {
      const limit = u.dailyRequestLimit ? `/${u.dailyRequestLimit}` : "";
      out(`  ${provider.padEnd(34)} ${String(u.requests).padStart(4)}${limit} requests  ${u.tokens.toLocaleString()} tokens`);
    }
  }
}
