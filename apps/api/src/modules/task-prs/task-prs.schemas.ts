import { z } from "zod";
import { jiraKeySchema } from "../../lib/http/schemas.js";

const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/;
const BRANCH = /^[\w./-]{1,255}$/;
const SHA = /^[0-9a-f]{7,64}$/;
const REVIEWER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}(\/[A-Za-z0-9_.-]+)?$/;

export const recordPrSchema = z
  .object({
    taskKey: jiraKeySchema,
    epicKey: jiraKeySchema.nullable().default(null),
    repo: z.string().regex(REPO).nullable().default(null),
    branch: z.string().regex(BRANCH),
    baseSha: z.string().regex(SHA),
    headSha: z.string().regex(SHA).nullable().default(null),
    prNumber: z.number().int().positive().nullable().default(null),
    prUrl: z.string().url().startsWith("https://").nullable().default(null),
    title: z.string().min(1).max(300),
    reviewers: z.array(z.string().regex(REVIEWER)).max(15).default([]),
    runId: z.string().uuid().nullable().default(null),
  })
  .strict();
export type RecordPrInput = z.infer<typeof recordPrSchema>;

export const ciReportSchema = z
  .object({
    status: z.enum(["in_progress", "completed"]),
    conclusion: z.enum(["success", "failure", "cancelled"]).optional(),
    branch: z.string().regex(BRANCH),
    prNumber: z.number().int().positive().optional(),
    headSha: z.string().regex(SHA).optional(),
    runUrl: z.string().url().startsWith("https://github.com/").optional(),
    jobs: z.array(z.object({ name: z.string().min(1).max(100), result: z.string().min(1).max(30) })).max(30).default([]),
    tests: z.object({ passed: z.number().int().min(0), failed: z.number().int().min(0), skipped: z.number().int().min(0) }).optional(),
  })
  .strict();
export type CiReport = z.infer<typeof ciReportSchema>;

export const listQuerySchema = z.object({ epicKey: jiraKeySchema.optional(), taskKey: jiraKeySchema.optional() }).strict();

// The runtime reports lifecycle events AURA cannot see itself: Gate 4 approved, Gate 8 approved.
export const taskEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("started"), taskKey: jiraKeySchema }).strict(),
  z.object({ event: z.literal("released"), epicKey: jiraKeySchema }).strict(),
]);

export const taskKeyParamsSchema = z.object({ taskKey: jiraKeySchema });
