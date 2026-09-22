const SAFE_OR_VALUE = /^[A-Za-z0-9_-]+$/;

export function assertSafeOrValue(value: string, label: string): string {
  if (!SAFE_OR_VALUE.test(value)) {
    throw new Error(`Unsafe value for PostgREST .or() filter (${label}): ${JSON.stringify(value)}`);
  }
  return value;
}
