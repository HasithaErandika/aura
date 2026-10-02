import { badRequest } from "../../lib/http/errors.js";
import { logger } from "../../lib/logger.js";
import { userIdsWithRole } from "../identity/index.js";
import { notify } from "../notifications/index.js";
import { githubRepositoryId } from "../projects/index.js";
import { applyCiReport } from "./ci-report.js";
import { applyPrEvent, pullRequestEventSchema } from "./pr-event.js";
import { moveTaskStatus } from "./task-status.js";
import { taskPrsRepository } from "./task-prs.repository.js";
import type { CiReport, RecordPrInput } from "./task-prs.schemas.js";
import { taskFromBranch, toTaskPrView, type TaskPrView } from "./task-prs.types.js";

const prLink = (taskKey: string) => `/app/qa?task=${encodeURIComponent(taskKey)}`;

function ignoreReport(repo: string, report: CiReport, reason: string): never {
  logger.info("CI report ignored", { repo, branch: report.branch, reason });
  throw badRequest(reason);
}

export async function getTaskPr(taskKey: string): Promise<TaskPrView | null> {
  const row = await taskPrsRepository.findByTask(taskKey);
  return row ? toTaskPrView(row) : null;
}

export async function listTaskPrs(filter: { epicKey?: string; taskKey?: string }): Promise<TaskPrView[]> {
  return (await taskPrsRepository.list(filter)).map(toTaskPrView);
}

export async function recordPrOpened(input: RecordPrInput, openedBy: string | null, requestId?: string): Promise<TaskPrView> {
  const view = toTaskPrView(
    await taskPrsRepository.upsert({
      task_key: input.taskKey,
      epic_key: input.epicKey,
      repo_full_name: input.repo,
      repository_id: await githubRepositoryId(input.repo),
      branch: input.branch,
      base_sha: input.baseSha,
      head_sha: input.headSha,
      pr_number: input.prNumber,
      pr_url: input.prUrl,
      pr_title: input.title,
      pr_state: input.prNumber ? "open" : null,
      reviewers: input.reviewers,
      opened_by: openedBy,
      run_id: input.runId,
      ci_state: input.prNumber ? "pending" : null,
      updated_at: new Date().toISOString(),
    }),
  );
  if (view.prNumber) {
    await notify(await userIdsWithRole("qa_engineer"), {
      kind: "pr_opened",
      title: `${view.taskKey}: pull request #${view.prNumber} opened`,
      body: `${view.prTitle ?? ""}${view.reviewers.length ? `\nReviewers: ${view.reviewers.join(", ")}` : ""}`,
      link: prLink(view.taskKey),
      taskKey: view.taskKey,
    });
    await moveTaskStatus(view.taskKey, "in_review", requestId);
  }
  return view;
}

type Target = { taskKey: string; existing: TaskPrView | null } | { ignored: string };

// A repository's Task branch: its recorded row, or a new row when the repository is registered.
async function taskTarget(repo: string, branch: string, headSha: string | null): Promise<Target> {
  const byRepo = await taskPrsRepository.findByRepoBranch(repo, branch);
  if (byRepo) return { taskKey: byRepo.task_key, existing: toTaskPrView(byRepo) };

  const task = taskFromBranch(branch);
  if (!task) return { ignored: `${branch} is not a Task branch (feat/<EPIC>/<TASK>)` };
  const existing = await getTaskPr(task.taskKey);
  if (existing && existing.branch !== branch) return { ignored: `${task.taskKey} is recorded on ${existing.branch}, not ${branch}` };
  if (existing?.repo && existing.repo !== repo) return { ignored: `${task.taskKey} belongs to ${existing.repo}, not ${repo}` };
  if (existing) return { taskKey: task.taskKey, existing };

  const repositoryId = await githubRepositoryId(repo);
  if (!repositoryId) return { ignored: `${repo} is not registered to an AURA project` };
  await taskPrsRepository.insert({ task_key: task.taskKey, epic_key: task.epicKey, branch, base_sha: headSha ?? "0000000", repo_full_name: repo, repository_id: repositoryId });
  return { taskKey: task.taskKey, existing: null };
}

// A CI report updates its own repository's row, or creates one for a registered repository.
async function reportTarget(repo: string, report: CiReport): Promise<{ taskKey: string; existing: TaskPrView | null }> {
  const target = await taskTarget(repo, report.branch, report.headSha ?? null);
  if ("ignored" in target) ignoreReport(repo, report, target.ignored);
  return target;
}

function ciNotificationBody(view: TaskPrView): string {
  const failed = (view.ciSummary.jobs ?? []).filter((j) => j.result === "failure").map((j) => j.name);
  const tests = view.ciSummary.tests;
  return [failed.length ? `Failed: ${failed.join(", ")}` : "", tests ? `Tests: ${tests.passed} passed, ${tests.failed} failed, ${tests.skipped} skipped` : ""].filter(Boolean).join("\n");
}

export async function recordCiReport(repo: string, report: CiReport): Promise<TaskPrView> {
  const { taskKey, existing } = await reportTarget(repo, report);
  const { patch, notify: kind } = applyCiReport(existing, report, repo);
  const view = toTaskPrView(await taskPrsRepository.update(taskKey, patch));
  if (kind) {
    await notify([...(await userIdsWithRole("qa_engineer")), view.openedBy], {
      kind,
      title: `${view.taskKey}: CI ${kind === "ci_passed" ? "passed" : "failed"}${view.prNumber ? ` on PR #${view.prNumber}` : ""}`,
      body: ciNotificationBody(view),
      link: prLink(view.taskKey),
      taskKey: view.taskKey,
    });
  }
  return view;
}

// GitHub's pull_request webhook: PRs opened outside AURA, merges by a person, closes.
export async function recordPrEvent(payload: Record<string, unknown>, requestId?: string): Promise<"handled" | "ignored"> {
  const parsed = pullRequestEventSchema.safeParse(payload);
  if (!parsed.success) return "ignored";
  const event = parsed.data;
  const repo = event.repository.full_name;
  const target = await taskTarget(repo, event.pull_request.head.ref, event.pull_request.head.sha);
  if ("ignored" in target) {
    logger.info("pull request event ignored", { repo, branch: event.pull_request.head.ref, reason: target.ignored });
    return "ignored";
  }
  const effect = applyPrEvent(target.existing, event);
  if (!effect) return "ignored";
  const view = toTaskPrView(await taskPrsRepository.update(target.taskKey, effect.patch));
  if (effect.notify) {
    const merged = effect.notify === "pr_merged";
    await notify([...(await userIdsWithRole("qa_engineer")), ...(merged ? [view.openedBy] : [])], {
      kind: effect.notify,
      title: `${view.taskKey}: pull request #${view.prNumber} ${merged ? "merged" : "opened"}`,
      body: view.prTitle ?? "",
      link: prLink(view.taskKey),
      taskKey: view.taskKey,
    });
  }
  if (effect.status) await moveTaskStatus(view.taskKey, effect.status, requestId);
  return "handled";
}

export async function recordDependencies(pairs: { taskKey: string; dependsOn: string }[]): Promise<void> {
  await taskPrsRepository.addDependencies(pairs.map((p) => ({ task_key: p.taskKey, depends_on: p.dependsOn })));
}

export interface Dependency {
  taskKey: string;
  prState: TaskPrView["prState"];
  merged: boolean;
}

// A Task starts only when every Task it depends on is merged (step 3.4).
export async function taskDependencies(taskKey: string): Promise<{ dependencies: Dependency[]; waitingFor: string[] }> {
  const dependencies = (await taskPrsRepository.dependenciesOf(taskKey)).map((d) => ({ taskKey: d.dependsOn, prState: d.prState, merged: d.prState === "merged" }));
  return { dependencies, waitingFor: dependencies.filter((d) => !d.merged).map((d) => d.taskKey) };
}
