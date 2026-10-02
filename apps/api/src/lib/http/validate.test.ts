import { describe, expect, it } from "vitest";
import { z } from "zod";
import { HttpError } from "./errors.js";
import { idParam, parseOrThrow, positiveIntParam, uuidParam } from "./validate.js";

function errorOf(fn: () => unknown): HttpError {
  try {
    fn();
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error("expected an HttpError");
}

describe("parseOrThrow", () => {
  it("returns parsed data", () => {
    expect(parseOrThrow(z.object({ n: z.coerce.number() }), { n: "3" })).toEqual({ n: 3 });
  });

  it("throws validation_failed (422)", () => {
    const error = errorOf(() => parseOrThrow(z.object({ n: z.number() }), { n: "x" }));
    expect(error.status).toBe(422);
    expect(error.code).toBe("validation_failed");
  });
});

describe("path params", () => {
  it("accepts well-formed values", () => {
    expect(uuidParam("3f8e0a52-0c43-4b8e-9d7e-6a1f0e2b3c4d", "Run")).toBe("3f8e0a52-0c43-4b8e-9d7e-6a1f0e2b3c4d");
    expect(idParam("thread_1-a", "Conversation")).toBe("thread_1-a");
    expect(positiveIntParam("4", "Version")).toBe(4);
  });

  it.each([
    () => uuidParam("not-a-uuid", "Run"),
    () => uuidParam(undefined, "Run"),
    () => idParam("../etc", "Conversation"),
    () => positiveIntParam("0", "Version"),
    () => positiveIntParam("1.5", "Version"),
  ])("maps a malformed value to 404 (%#)", (fn) => {
    const error = errorOf(fn);
    expect(error.status).toBe(404);
    expect(error.code).toBe("not_found");
  });
});
