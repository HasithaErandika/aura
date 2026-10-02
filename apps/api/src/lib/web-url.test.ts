import { describe, expect, it } from "vitest";
import { webUrl } from "./web-url.js";

describe("webUrl", () => {
  it("joins the first web origin and a path", () => {
    expect(webUrl("/app/qa?task=KAN-1")).toBe("http://localhost:5173/app/qa?task=KAN-1");
  });
});
