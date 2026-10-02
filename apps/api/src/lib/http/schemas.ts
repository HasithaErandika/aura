import { z } from "zod";

export const agentIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

const JIRA_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;
export const jiraKeySchema = z.string().regex(JIRA_KEY, "a Jira key like KAN-36");

export function enumList<const T extends readonly string[]>(values: T) {
  return z
    .string()
    .optional()
    .transform((raw) => (raw ? raw.split(",").filter((s): s is T[number] => (values as readonly string[]).includes(s)) : undefined));
}

export function limitQuery(max: number, fallback: number) {
  return z.coerce.number().int().min(1).max(max).default(fallback);
}

export function daysQuery(fallback: number, max = 90) {
  return z.coerce.number().int().min(1).max(max).catch(fallback);
}
