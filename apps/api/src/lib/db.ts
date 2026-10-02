export interface DbErrorLike {
  message: string;
  code?: string;
}

const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
const SAFE_OR_VALUE = /^[A-Za-z0-9_-]+$/;

export function dbError(context: string, error: DbErrorLike): Error {
  const missing = (error.code !== undefined && MISSING_SCHEMA_CODES.has(error.code)) || /does not exist/i.test(error.message);
  return new Error(`${context}: ${error.message}${missing ? " (apply the pending supabase/migrations)" : ""}`);
}

export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

export function orValue(value: string, label: string): string {
  if (!SAFE_OR_VALUE.test(value)) throw new Error(`Unsafe value for PostgREST .or() filter (${label}): ${JSON.stringify(value)}`);
  return value;
}
