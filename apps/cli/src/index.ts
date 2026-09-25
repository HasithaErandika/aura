#!/usr/bin/env node
import { Command, Option } from "commander";
import { AuraApiError } from "@aura/client";
import { login, logout, whoami } from "./commands/auth.js";
import { open, status, tasks } from "./commands/tasks.js";
import { approve, code, CODING_PROVIDERS, reject, revise, say } from "./commands/code.js";
import { commit, diff, push } from "./commands/git.js";
import { err } from "./ui.js";

// `aura` - AURA's developer CLI (docs/plans/aura-code-cli-council.md section 4.3). A thin client
// of apps/api: every action here is an API call the web app could also make, under the same
// auth, policy, approvals and audit. Local git (diff/commit/push) runs on this machine with the
// developer's own identity and credentials.

const program = new Command();
program.name("aura").description("AURA developer CLI - Tasks, the Coding Council, approvals, and commits as yourself").version("0.1.0");

program
  .command("login")
  .description("store the API URL and a personal access token (create one on the web Profile page)")
  .option("--api <url>", "AURA API URL (default http://localhost:4000)")
  .option("--token <token>", "access token (prompted if omitted)")
  .option("--no-git-identity", "do not send your git user.name/email to your AURA profile")
  .action(login);

program.command("logout").description("forget the stored token").action(logout);
program.command("whoami").description("show who you are logged in as").option("--json").action(whoami);

program.command("tasks").description("list the Tasks of an Epic").option("-e, --epic <key>", "Epic key (default: the current worktree's Epic)").option("--json").action(tasks);

program
  .command("open [task]")
  .description("show a Task's worktree, or open it in VS Code")
  .option("--code", "open the worktree in VS Code")
  .option("--path", "print only the path - cd \"$(aura open KAN-45 --path)\"")
  .option("--json")
  .action(open);

program.command("status [task]").description("pending gates, the Task's conversation, and today's model usage").option("--json").action(status);

program
  .command("code [task]")
  .description("start coding a Task: drafts the plan, then asks you to approve it (Gate 5)")
  .option("-e, --epic <key>", "Epic key (needed only before the Task has a worktree)")
  .addOption(new Option("-p, --provider <provider>", "who writes the code").choices(CODING_PROVIDERS).default("council"))
  .option("-n, --note <text>", "extra guidance for the agents")
  .option("--new-thread", "start a fresh conversation instead of continuing the Task's last one")
  .option("--no-prompt", "do not offer to decide the gate interactively")
  .option("-v, --verbose", "print full tool results")
  .action(code);

program
  .command("approve [approvalId]")
  .description("approve the pending gate (default: this Task's, or the only one waiting on you)")
  .option("--answer <text>", "which option to pick, when the gate offers several")
  .option("--no-prompt", "do not offer to decide a follow-up gate interactively")
  .action(approve);

program.command("reject [approvalId]").description("reject the pending gate").requiredOption("-r, --reason <text>", "why").action(reject);

program
  .command("revise <feedback>")
  .description("send the pending gate back with feedback")
  .option("--id <approvalId>", "which gate")
  .option("--no-prompt", "do not offer to decide the revised gate interactively")
  .action(revise);

program
  .command("say <text>")
  .description("add a note to the next Coding Council round")
  .option("-t, --task <key>", "Task key (default: current worktree)")
  .option("--draft <id>", "coding draft id (default: the Task's last one)")
  .action(say);

program
  .command("diff [task]")
  .description("what this Task changed since it branched")
  .option("--stat", "summary only")
  .option("--uncommitted", "only changes not yet committed")
  .action(diff);

program
  .command("commit [task]")
  .description("commit the Task's changes as you, with AURA trailers")
  .option("-m, --message <msg>", "commit message (default: \"<TASK>: <Jira summary>\")")
  .option("--no-squash", "keep council checkpoint commits instead of folding them in")
  .action(commit);

program
  .command("push [task]")
  .description("push the Task branch with your own git credentials")
  .option("--pr", "open a pull request with gh")
  .option("--remote <name>", "remote to push to", "origin")
  .action(push);

try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof AuraApiError) {
    err(error.status === 401 ? `${error.message} - run \`aura login\` again` : error.message);
  } else {
    err(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
}
