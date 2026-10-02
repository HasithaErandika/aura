import { badRequest } from "../../lib/http/errors.js";
import { logger } from "../../lib/logger.js";
import { userIdsWithRole } from "../identity/index.js";
import { notify } from "../notifications/index.js";
import { githubRepositoryId } from "../projects/index.js";
import { applyCiReport } from "./ci-report.js";
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

export async function recordPrOpened(input: RecordPrInput, openedBy: string | null): Promise<TaskPrView> {
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
  }
  return view;
}

// A CI report updates its own repository's row, or creates one for a registered repository.
async function reportTarget(repo: string, report: CiReport): Promise<{ taskKey: string; existing: TaskPrView | null }> {
  const byRepo = await taskPrsRepository.findByRepoBranch(repo, report.branch);
  if (byRepo) return { taskKey: byRepo.task_key, existing: toTaskPrView(byRepo) };

  const task = taskFromBranch(report.branch);
  if (!task) ignoreReport(repo, report, `${report.branch} is not a Task branch (feat/<EPIC>/<TASK>)`);
  const existing = await getTaskPr(task.taskKey);
  if (existing && existing.branch !== report.branch) ignoreReport(repo, report, `${task.taskKey} is recorded on ${existing.branch}, not ${report.branch}`);
  if (existing?.repo && existing.repo !== repo) ignoreReport(repo, report, `${task.taskKey} belongs to ${existing.repo}, not ${repo}`);
  if (existing) return { taskKey: task.taskKey, existing };

  const repositoryId = await githubRepositoryId(repo);
  if (!repositoryId) ignoreReport(repo, report, `${repo} is not registered to an AURA project`);
  await taskPrsRepository.insert({ task_key: task.taskKey, epic_key: task.epicKey, branch: report.branch, base_sha: report.headSha ?? "0000000", repo_full_name: repo, repository_id: repositoryId });
  return { taskKey: task.taskKey, existing: null };
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
