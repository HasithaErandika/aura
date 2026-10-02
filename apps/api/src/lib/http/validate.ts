import { z, type ZodTypeAny } from "zod";
import { notFound, validationFailed } from "./errors.js";

const uuid = z.string().uuid();
const safeId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const positiveInt = z.coerce.number().int().min(1);

export function parseOrThrow<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw validationFailed(result.error.flatten());
  return result.data;
}

function pathParam<T extends ZodTypeAny>(schema: T, value: unknown, what: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw notFound(what);
  return parsed.data;
}

export const uuidParam = (value: string | undefined, what: string): string => pathParam(uuid, value, what);
export const idParam = (value: string | undefined, what: string): string => pathParam(safeId, value, what);
export const positiveIntParam = (value: string | undefined, what: string): number => pathParam(positiveInt, value, what);
