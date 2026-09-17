export type ErrorCode =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "rate_limited"
  | "runtime_unavailable"
  | "upstream_error"
  | "internal";

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, "bad_request", message, details);
export const unauthenticated = (message = "Authentication required") => new HttpError(401, "unauthenticated", message);
export const forbidden = (message = "You do not have permission to do this", details?: unknown) =>
  new HttpError(403, "forbidden", message, details);
export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found`);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
export const validationFailed = (details: unknown) => new HttpError(422, "validation_failed", "Request validation failed", details);
export const runtimeUnavailable = (message: string) => new HttpError(503, "runtime_unavailable", message);
export const upstreamError = (message: string, details?: unknown) => new HttpError(502, "upstream_error", message, details);
