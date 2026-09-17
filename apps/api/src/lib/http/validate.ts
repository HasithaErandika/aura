import { z, type ZodTypeAny } from "zod";
import { notFound, validationFailed } from "./errors.js";

// Zod-validate a request part. Schemas are strict so a client cannot smuggle extra fields
// (mirrors the tool-gateway rule in FR-AUTH-6 for the API).
export function parseOrThrow<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationFailed(result.error.flatten());
  }
  return result.data;
}

const uuid = z.string().uuid();
// Runtime thread ids are uuids today; allow a conservative charset so a future id format
// still cannot carry path characters into the runtime URL.
const safeId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

// Path ids that fail validation cannot match a row, so they are reported as not found.
export function uuidParam(value: string | undefined, what: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success) throw notFound(what);
  return parsed.data;
}

export function idParam(value: string | undefined, what: string): string {
  const parsed = safeId.safeParse(value);
  if (!parsed.success) throw notFound(what);
  return parsed.data;
}

export const agentIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

// Comma-separated enum list from a query string, unknown values dropped.
export function enumList<const T extends readonly string[]>(values: T) {
  return z
    .string()
    .optional()
    .transform((raw) => (raw ? raw.split(",").filter((s): s is T[number] => (values as readonly string[]).includes(s)) : undefined));
}
