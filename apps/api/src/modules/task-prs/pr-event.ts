import { z } from "zod";
import type { TaskEvent } from "./task-status.js";
import type { TaskPrView } from "./task-prs.types.js";

const SHA = /^[0-9a-f]{7,64}$/;

// The parts of GitHub's pull_request webhook payload AURA reads; everything else is ignored.
export const pullRequestEventSchema = z.object({
  action: z.string().min(1).max(50),
  repository: z.object({ full_name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/) }),
  pull_request: z.object({
    number: z.number().int().positive(),
    html_url: z.string().url().startsWith("https://"),
    title: z.string().max(1000),
    merged: z.boolean().nullable().optional(),
    merge_commit_sha: z.string().regex(SHA).nullable().optional(),
    head: z.object({ ref: z.string().min(1).max(255), sha: z.string().regex(SHA) }),
  }),
});
export type PullRequestEvent = z.infer<typeof pullRequestEventSchema>;

export interface PrEventEffect {
  patch: Record<string, unknown>;
  notify: "pr_opened" | "pr_merged" | null;
  status: TaskEvent | null;
}

const OPENED = new Set(["opened", "reopened", "ready_for_review"]);

// What a pull request event changes on the Task's row; null for actions AURA does not track.
export function applyPrEvent(existing: TaskPrView | null, event: PullRequestEvent, at = new Date().toISOString()): PrEventEffect | null {
  const pr = event.pull_request;
  const base = { head_sha: pr.head.sha, updated_at: at };
  if (OPENED.has(event.action)) {
    const isNew = existing?.prNumber !== pr.number || existing.prState !== "open";
    return {
      patch: { ...base, pr_number: pr.number, pr_url: pr.html_url, pr_title: pr.title.slice(0, 300), pr_state: "open", repo_full_name: event.repository.full_name },
      notify: isNew ? "pr_opened" : null,
      status: "in_review",
    };
  }
  if (event.action === "synchronize") return { patch: base, notify: null, status: null };
  if (event.action !== "closed") return null;
  if (!pr.merged) return { patch: { ...base, pr_state: "closed" }, notify: null, status: null };
  return {
    patch: { ...base, pr_state: "merged", merged_at: at, ...(pr.merge_commit_sha ? { merge_sha: pr.merge_commit_sha } : {}) },
    notify: existing?.prState === "merged" ? null : "pr_merged",
    status: "merged",
  };
}
