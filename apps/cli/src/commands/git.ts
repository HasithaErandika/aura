import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { requireWorktree, resolveTask, session } from "../context.js";
import { auraTrailers, commandExists, git, run } from "../git.js";
import { c, out, warn } from "../ui.js";

// AURA's own working files inside a worktree - the coding prompt file and the council
// transcript directory. Never part of the developer's commit.
const AURA_LOCAL_FILES = [".aura/", ".aura-task-prompt.txt"];
const AURA_EMAIL = "aura@localhost";

async function ensureExcluded(cwd: string): Promise<void> {
  const commonDir = path.resolve(cwd, (await git(cwd, ["rev-parse", "--git-common-dir"])).trim());
  const excludeFile = path.join(commonDir, "info", "exclude");
  const current = await readFile(excludeFile, "utf8").catch(() => "");
  const missing = AURA_LOCAL_FILES.filter((p) => !current.split("\n").includes(p));
  if (missing.length === 0) return;
  await mkdir(path.dirname(excludeFile), { recursive: true });
  await appendFile(excludeFile, `${current && !current.endsWith("\n") ? "\n" : ""}# AURA working files\n${missing.join("\n")}\n`);
}

// The branch the Task worktree was cut from: the main worktree's checked-out branch (the
// discipline's base repo, agent-runtime workspace/dev-workspace.ts).
async function baseBranch(cwd: string): Promise<string> {
  const listing = await git(cwd, ["worktree", "list", "--porcelain"]);
  const main = listing.split("\n\n")[0] ?? "";
  const branch = /^branch refs\/heads\/(.+)$/m.exec(main)?.[1];
  if (!branch) throw new Error("Could not determine the base branch of this worktree");
  return branch;
}

async function mergeBase(cwd: string): Promise<string> {
  return (await git(cwd, ["merge-base", "HEAD", await baseBranch(cwd)])).trim();
}

export async function diff(taskArg: string | undefined, opts: { stat?: boolean; uncommitted?: boolean }): Promise<void> {
  const { client } = await session();
  const taskKey = await resolveTask(taskArg);
  const { path: cwd } = await requireWorktree(client, taskKey);
  await ensureExcluded(cwd);
  // Default: everything this Task changed since it branched (council checkpoint commits included);
  // --uncommitted: only what is not committed yet.
  const against = opts.uncommitted ? "HEAD" : await mergeBase(cwd);
  const args = ["diff", ...(opts.stat ? ["--stat"] : []), ...(process.stdout.isTTY ? ["--color=always"] : []), against];
  const text = await git(cwd, args);
  const untracked = (await git(cwd, ["ls-files", "--others", "--exclude-standard"])).trim();
  if (!text.trim() && !untracked) return out(c.gray("No changes."));
  if (text.trim()) out(text.trimEnd());
  if (untracked) {
    out();
    out(c.bold("New files (untracked):"));
    for (const file of untracked.split("\n")) out(c.green(`  + ${file}`));
  }
}

export async function commit(taskArg: string | undefined, opts: { message?: string; squash: boolean }): Promise<void> {
  const { client, config } = await session();
  const taskKey = await resolveTask(taskArg);
  const { path: cwd, branch } = await requireWorktree(client, taskKey);
  await ensureExcluded(cwd);

  const name = (await git(cwd, ["config", "user.name"]).catch(() => "")).trim();
  const email = (await git(cwd, ["config", "user.email"]).catch(() => "")).trim();
  if (!name || !email) throw new Error('Set your git identity first: git config --global user.name "…" && git config --global user.email "…"');

  // Council checkpoint commits ("council: round N", authored by AURA) are folded into this one
  // commit so the branch history shows the developer's approved change, not the agents' drafts.
  // Only when every commit since the branch point is AURA's - a developer's own commits are
  // never rewritten.
  const base = await mergeBase(cwd);
  const authors = (await git(cwd, ["log", "--format=%ae", `${base}..HEAD`])).trim().split("\n").filter(Boolean);
  if (opts.squash && authors.length > 0 && authors.every((a) => a === AURA_EMAIL)) {
    await git(cwd, ["reset", "--soft", base]);
    out(c.gray(`Folded ${authors.length} council checkpoint commit${authors.length === 1 ? "" : "s"} into this commit`));
  } else if (authors.some((a) => a === AURA_EMAIL)) {
    warn("This branch mixes AURA checkpoint commits with your own - committing on top without squashing.");
  }

  await git(cwd, ["add", "-A"]);
  const staged = (await git(cwd, ["diff", "--cached", "--name-only"])).trim();
  if (!staged) return out(c.gray("Nothing to commit."));

  let message = opts.message;
  if (!message) {
    const issue = await client.jira.issue(taskKey).catch(() => null);
    message = `${taskKey}: ${issue?.summary ?? "implement Task"}`;
  }
  const trailers = auraTrailers(taskKey, config.tasks[taskKey]?.lastDraftId);
  await git(cwd, ["commit", "-m", message, "-m", trailers.join("\n")]);
  const sha = (await git(cwd, ["rev-parse", "--short", "HEAD"])).trim();
  out(`${c.green("✓")} ${c.bold(sha)} ${message}`);
  out(c.gray(`  author ${name} <${email}> · ${staged.split("\n").length} file(s) · ${branch}`));
}

export async function push(taskArg: string | undefined, opts: { pr?: boolean; remote: string }): Promise<void> {
  const { client } = await session();
  const taskKey = await resolveTask(taskArg);
  const { path: cwd, branch } = await requireWorktree(client, taskKey);

  const remotes = (await git(cwd, ["remote"])).trim().split("\n").filter(Boolean);
  if (!remotes.includes(opts.remote)) {
    throw new Error(`This repo has no "${opts.remote}" remote. Add one once for the discipline's base repo: git -C "${cwd}" remote add ${opts.remote} git@github.com:<you>/<repo>.git`);
  }
  out(c.gray(`Pushing ${branch} to ${opts.remote}…`));
  await git(cwd, ["push", "-u", opts.remote, branch]);
  out(`${c.green("✓")} Pushed ${branch}`);

  if (!opts.pr) return;
  if (!(await commandExists("gh"))) throw new Error("`gh` (GitHub CLI) is not installed - install it or open the PR on GitHub.");
  const issue = await client.jira.issue(taskKey).catch(() => null);
  const title = `${taskKey}: ${issue?.summary ?? branch}`;
  const body = [issue?.url ? `Jira: ${issue.url}` : `Jira: ${taskKey}`, "", "Implemented with the AURA Coding Council and approved at Gate 5."].join("\n");
  const url = (await run("gh", ["pr", "create", "--head", branch, "--base", await baseBranch(cwd), "--title", title, "--body", body], cwd)).trim();
  out(`${c.green("✓")} Pull request: ${url}`);
}
