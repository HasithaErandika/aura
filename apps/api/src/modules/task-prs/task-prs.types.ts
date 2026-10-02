import { z } from "zod";

// A Task's pull request and its CI (migration 0012 on task_branches), as the QA page, the VS Code
// PR view and the runtime see it.

export const TASK_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;
export const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/;
export const BRANCH = /^[\w./-]{1,255}$/;

export const CI_STATES = ["pending", "running", "success", "failure", "cancelled"] as const;
export type CiState = (typeof CI_STATES)[number];

export interface CiJob {
  name: string;
  result: string; // success | failure | cancelled | skipped
}

export interface CiSummary {
  jobs?: CiJob[];
  tests?: { passed: number; failed: number; skipped: number };
}

export interface TaskPrView {
  taskKey: string;
  epicKey: string | null;
  repo: string | null;
  branch: string;
  prNumber: number | null;
  prUrl: string | null;
  prTitle: string | null;
  prState: "open" | "merged" | "closed" | null;
  reviewers: string[];
  headSha: string | null;
  ciState: CiState | null;
  ciUrl: string | null;
  ciSummary: CiSummary;
  ciUpdatedAt: string | null;
  openedBy: string | null;
  runId: string | null;
  updatedAt: string;
}

export const recordPrSchema = z
  .object({
    taskKey: z.string().regex(TASK_KEY),
    epicKey: z.string().regex(TASK_KEY).nullable().default(null),
    repo: z.string().regex(REPO).nullable().default(null),
    branch: z.string().regex(BRANCH),
    baseSha: z.string().regex(/^[0-9a-f]{7,64}$/),
    headSha: z.string().regex(/^[0-9a-f]{7,64}$/).nullable().default(null),
    prNumber: z.number().int().positive().nullable().default(null),
    prUrl: z.string().url().startsWith("https://").nullable().default(null),
    title: z.string().min(1).max(300),
    reviewers: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}(\/[A-Za-z0-9_.-]+)?$/)).max(15).default([]),
    runId: z.string().uuid().nullable().default(null),
  })
  .strict();
export type RecordPrInput = z.infer<typeof recordPrSchema>;

const jobSchema = z.object({ name: z.string().min(1).max(100), result: z.string().min(1).max(30) });

export const ciReportSchema = z
  .object({
    status: z.enum(["in_progress", "completed"]),
    conclusion: z.enum(["success", "failure", "cancelled"]).optional(),
    branch: z.string().regex(BRANCH),
    prNumber: z.number().int().positive().optional(),
    headSha: z.string().regex(/^[0-9a-f]{7,64}$/).optional(),
    runUrl: z.string().url().startsWith("https://github.com/").optional(),
    jobs: z.array(jobSchema).max(30).default([]),
    tests: z.object({ passed: z.number().int().min(0), failed: z.number().int().min(0), skipped: z.number().int().min(0) }).optional(),
  })
  .strict();
export type CiReport = z.infer<typeof ciReportSchema>;

export const listQuerySchema = z
  .object({
    epicKey: z.string().regex(TASK_KEY).optional(),
    taskKey: z.string().regex(TASK_KEY).optional(),
  })
  .strict();

// feat/<EPIC>/<TASK> or feat/<TASK> → the Task key; null for any other branch.
export function taskFromBranch(branch: string): { taskKey: string; epicKey: string | null } | null {
  const m = /^feat\/(?:([A-Z][A-Z0-9_]*-\d+)\/)?([A-Z][A-Z0-9_]*-\d+)$/.exec(branch);
  return m ? { taskKey: m[2]!, epicKey: m[1] ?? null } : null;
}

export function ciStateOf(report: Pick<CiReport, "status" | "conclusion">): CiState {
  if (report.status === "in_progress") return "running";
  return report.conclusion ?? "failure";
}
