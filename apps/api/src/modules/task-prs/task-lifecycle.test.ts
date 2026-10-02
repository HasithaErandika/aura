import { describe, expect, it } from "vitest";
import { applyPrEvent, pullRequestEventSchema } from "./pr-event.js";
import { dependenciesSchema, taskEventSchema } from "./task-prs.schemas.js";
import type { TaskPrView } from "./task-prs.types.js";
import { statusPlan } from "./task-status.js";

const settings = (over: Record<string, string> = {}) =>
  Object.fromEntries(
    Object.entries({ "jira.statusInProgress": "In Progress", "jira.statusInReview": "In Review", "jira.statusReadyForRelease": "Ready for Release", "jira.statusDone": "Done", ...over }).map(([k, v]) => [k, { value: v }]),
  );

describe("Task status plan", () => {
  it("maps each lifecycle event to its configured status, in order", () => {
    expect(statusPlan(settings(), "merged")).toEqual({ target: "Ready for Release", order: ["In Progress", "In Review", "Ready for Release", "Done"] });
    expect(statusPlan(settings({ "jira.statusInReview": "Code Review" }), "in_review")?.target).toBe("Code Review");
  });

  it("skips a move set to none and leaves it out of the order", () => {
    expect(statusPlan(settings({ "jira.statusInReview": "none" }), "in_review")).toBeNull();
    expect(statusPlan(settings({ "jira.statusInReview": "NONE" }), "released")?.order).toEqual(["In Progress", "Ready for Release", "Done"]);
  });
});

const event = (action: string, pr: Record<string, unknown> = {}) =>
  pullRequestEventSchema.parse({
    action,
    repository: { full_name: "acme/tickets" },
    pull_request: { number: 7, html_url: "https://github.com/acme/tickets/pull/7", title: "KAN-45: list", head: { ref: "feat/KAN-36/KAN-45", sha: "abc1234" }, ...pr },
  });

const row: TaskPrView = { taskKey: "KAN-45", epicKey: "KAN-36", repo: "acme/tickets", branch: "feat/KAN-36/KAN-45", prNumber: 7, prUrl: null, prTitle: "x", prState: "open", reviewers: [], headSha: "abc1234", mergedAt: null, mergeSha: null, ciState: null, ciUrl: null, ciSummary: {}, ciUpdatedAt: null, openedBy: "u1", runId: null, updatedAt: "" };
const AT = "2026-10-02T12:00:00.000Z";

describe("pull request events", () => {
  it("records a PR opened outside AURA, notifies QA once and moves the Task to review", () => {
    expect(applyPrEvent(null, event("opened"), AT)).toMatchObject({ notify: "pr_opened", status: "in_review", patch: { pr_number: 7, pr_state: "open", pr_url: "https://github.com/acme/tickets/pull/7" } });
    expect(applyPrEvent(row, event("opened"), AT)?.notify).toBeNull();
    expect(applyPrEvent({ ...row, prState: "closed" }, event("reopened"), AT)?.notify).toBe("pr_opened");
  });

  it("records a merge with its commit, notifies once and moves the Task to ready for release", () => {
    const merged = event("closed", { merged: true, merge_commit_sha: "def5678" });
    expect(applyPrEvent(row, merged, AT)).toEqual({ notify: "pr_merged", status: "merged", patch: { head_sha: "abc1234", updated_at: AT, pr_state: "merged", merged_at: AT, merge_sha: "def5678" } });
    expect(applyPrEvent({ ...row, prState: "merged" }, merged, AT)?.notify).toBeNull();
  });

  it("records a close without merge and moves nothing", () => {
    expect(applyPrEvent(row, event("closed", { merged: false }), AT)).toMatchObject({ notify: null, status: null, patch: { pr_state: "closed" } });
  });

  it("tracks new commits and ignores actions AURA does not use", () => {
    expect(applyPrEvent(row, event("synchronize", { head: { ref: "feat/KAN-36/KAN-45", sha: "fff0000" } }), AT)).toEqual({ notify: null, status: null, patch: { head_sha: "fff0000", updated_at: AT } });
    expect(applyPrEvent(row, event("labeled"), AT)).toBeNull();
  });

  it("refuses payloads with unsafe values", () => {
    expect(pullRequestEventSchema.safeParse({ action: "opened", repository: { full_name: "acme/tickets" }, pull_request: { number: 7, html_url: "http://evil", title: "x", head: { ref: "b", sha: "abc1234" } } }).success).toBe(false);
    expect(pullRequestEventSchema.safeParse({ action: "closed", repository: { full_name: "acme/tickets" }, pull_request: { number: 7, html_url: "https://github.com/x", title: "x", merge_commit_sha: "nope", head: { ref: "b", sha: "abc1234" } } }).success).toBe(false);
  });
});

describe("runtime lifecycle events", () => {
  it("accepts work started on a Task and an Epic released, nothing else", () => {
    expect(taskEventSchema.parse({ event: "started", taskKey: "KAN-45" })).toEqual({ event: "started", taskKey: "KAN-45" });
    expect(taskEventSchema.parse({ event: "released", epicKey: "KAN-36" })).toEqual({ event: "released", epicKey: "KAN-36" });
    expect(() => taskEventSchema.parse({ event: "merged", taskKey: "KAN-45" })).toThrow();
    expect(() => taskEventSchema.parse({ event: "started", epicKey: "KAN-36" })).toThrow();
  });
});

describe("Task dependencies", () => {
  it("accepts Task → dependency pairs and refuses a Task depending on itself", () => {
    expect(dependenciesSchema.parse({ dependencies: [{ taskKey: "KAN-41", dependsOn: "KAN-40" }] }).dependencies).toHaveLength(1);
    expect(() => dependenciesSchema.parse({ dependencies: [{ taskKey: "KAN-41", dependsOn: "KAN-41" }] })).toThrow();
    expect(() => dependenciesSchema.parse({ dependencies: [{ taskKey: "KAN-41", dependsOn: "not a key" }] })).toThrow();
  });
});
