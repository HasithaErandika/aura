export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong";
}

export function isRuntimeUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.code === "runtime_unavailable";
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}
