import { supabaseAdmin } from "../../lib/supabase.js";
import { notify, usersWithRole } from "./notifications.service.js";
import { applyCiReport } from "./ci-report.js";
import { taskFromBranch, type CiReport, type CiState, type CiSummary, type RecordPrInput, type TaskPrView } from "./task-prs.types.js";

// Pull requests and CI per Task (migration 0012). The runtime records the PR Gate 6 opened; the
// project's CI reports each run (POST /ci/report); QA reads both on the QA page and is notified.

interface Row {
  task_key: string;
  epic_key: string | null;
  repo_full_name: string | null;
  branch: string;
  pr_number: number | null;
  pr_url: string | null;
  pr_title: string | null;
  pr_state: TaskPrView["prState"];
  reviewers: string[] | null;
  head_sha: string | null;
  ci_state: CiState | null;
  ci_url: string | null;
  ci_summary: CiSummary | null;
  ci_updated_at: string | null;
  opened_by: string | null;
  run_id: string | null;
  updated_at: string;
}

const COLUMNS = "task_key, epic_key, repo_full_name, branch, pr_number, pr_url, pr_title, pr_state, reviewers, head_sha, ci_state, ci_url, ci_summary, ci_updated_at, opened_by, run_id, updated_at";

export function toView(r: Row): TaskPrView {
  return {
    taskKey: r.task_key,
    epicKey: r.epic_key,
    repo: r.repo_full_name,
    branch: r.branch,
    prNumber: r.pr_number,
    prUrl: r.pr_url,
    prTitle: r.pr_title,
    prState: r.pr_state,
    reviewers: r.reviewers ?? [],
    headSha: r.head_sha,
    ciState: r.ci_state,
    ciUrl: r.ci_url,
    ciSummary: r.ci_summary ?? {},
    ciUpdatedAt: r.ci_updated_at,
    openedBy: r.opened_by,
    runId: r.run_id,
    updatedAt: r.updated_at,
  };
}

function dbError(context: string, error: { message: string }): Error {
  return new Error(`${context}: ${error.message}${/column|task_branches/.test(error.message) ? " (apply supabase/migrations/0012_task_prs_notifications.sql)" : ""}`);
}

const prLink = (taskKey: string) => `/app/qa?task=${encodeURIComponent(taskKey)}`;

// The registered repository with this GitHub name, if any (migration 0007).
async function repositoryId(repo: string | null): Promise<string | null> {
  if (!repo) return null;
  const [owner, name] = repo.split("/");
  const { data } = await supabaseAdmin.from("repositories").select("id").eq("provider", "github").eq("owner", owner!).eq("name", name!).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function getTaskPr(taskKey: string): Promise<TaskPrView | null> {
  const { data, error } = await supabaseAdmin.from("task_branches").select(COLUMNS).eq("task_key", taskKey).maybeSingle();
  if (error) throw dbError("Could not read the Task's pull request", error);
  return data ? toView(data as Row) : null;
}

export async function listTaskPrs(filter: { epicKey?: string; taskKey?: string }): Promise<TaskPrView[]> {
  let q = supabaseAdmin.from("task_branches").select(COLUMNS).order("updated_at", { ascending: false }).limit(200);
  if (filter.epicKey) q = q.eq("epic_key", filter.epicKey);
  if (filter.taskKey) q = q.eq("task_key", filter.taskKey);
  const { data, error } = await q;
  if (error) throw dbError("Could not read pull requests", error);
  return ((data ?? []) as Row[]).map(toView);
}

// Gate 6 opened (or pushed) the Task's branch: record it and tell QA.
export async function recordPrOpened(input: RecordPrInput, openedBy: string | null): Promise<TaskPrView> {
  const row = {
    task_key: input.taskKey,
    epic_key: input.epicKey,
    repo_full_name: input.repo,
    repository_id: await repositoryId(input.repo),
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
  };
  const { data, error } = await supabaseAdmin.from("task_branches").upsert(row, { onConflict: "task_key" }).select(COLUMNS).single();
  if (error) throw dbError("Could not record the pull request", error);
  const view = toView(data as Row);
  if (view.prNumber) {
    await notify(await usersWithRole("qa_engineer"), {
      kind: "pr_opened",
      title: `${view.taskKey}: pull request #${view.prNumber} opened`,
      body: `${view.prTitle ?? ""}${view.reviewers.length ? `\nReviewers: ${view.reviewers.join(", ")}` : ""}`,
      link: prLink(view.taskKey),
      taskKey: view.taskKey,
    });
  }
  return view;
}

export class UnknownBranchError extends Error {}

// A CI run on a Task branch (from aura-ci.yml, repository proven by its OIDC token).
export async function recordCiReport(repo: string, report: CiReport): Promise<TaskPrView> {
  const { data: found, error } = await supabaseAdmin.from("task_branches").select(COLUMNS).eq("repo_full_name", repo).eq("branch", report.branch).maybeSingle();
  if (error) throw dbError("Could not read the Task's pull request", error);
  let existing = found ? toView(found as Row) : null;
  if (!existing) {
    // A PR AURA did not open (or opened before the repository name was known): match the branch.
    const task = taskFromBranch(report.branch);
    if (!task) throw new UnknownBranchError(`${report.branch} is not a Task branch (feat/<EPIC>/<TASK>)`);
    existing = await getTaskPr(task.taskKey);
    if (existing && existing.branch !== report.branch) throw new UnknownBranchError(`${task.taskKey} is recorded on ${existing.branch}, not ${report.branch}`);
    if (!existing) {
      const { error: insertError } = await supabaseAdmin.from("task_branches").insert({ task_key: task.taskKey, epic_key: task.epicKey, branch: report.branch, base_sha: report.headSha ?? "0000000", repo_full_name: repo, repository_id: await repositoryId(repo) });
      if (insertError) throw dbError("Could not record the Task branch", insertError);
    }
  }
  const { patch, notify: kind } = applyCiReport(existing, report, repo);
  const taskKey = existing?.taskKey ?? taskFromBranch(report.branch)!.taskKey;
  const { data, error: updateError } = await supabaseAdmin.from("task_branches").update(patch).eq("task_key", taskKey).select(COLUMNS).single();
  if (updateError) throw dbError("Could not record the CI result", updateError);
  const view = toView(data as Row);
  if (kind) {
    const failed = (view.ciSummary.jobs ?? []).filter((j) => j.result === "failure").map((j) => j.name);
    const tests = view.ciSummary.tests;
    await notify([...(await usersWithRole("qa_engineer")), view.openedBy], {
      kind,
      title: `${view.taskKey}: CI ${kind === "ci_passed" ? "passed" : "failed"}${view.prNumber ? ` on PR #${view.prNumber}` : ""}`,
      body: [failed.length ? `Failed: ${failed.join(", ")}` : "", tests ? `Tests: ${tests.passed} passed, ${tests.failed} failed, ${tests.skipped} skipped` : ""].filter(Boolean).join("\n"),
      link: prLink(view.taskKey),
      taskKey: view.taskKey,
    });
  }
  return view;
}
