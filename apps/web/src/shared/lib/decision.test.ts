import { describe, expect, it } from "vitest";
import { classifyOption } from "./decision.ts";

describe("gate option classification", () => {
  it("maps option wording to a recorded decision", () => {
    expect(classifyOption("Approve and file").decision).toBe("approve");
    expect(classifyOption("Request changes")).toEqual({ decision: "revise", label: "Request changes", needsReason: true });
    expect(classifyOption("Reject")).toMatchObject({ decision: "reject", needsReason: true });
    expect(classifyOption("Option B").decision).toBe("answer");
  });
});
