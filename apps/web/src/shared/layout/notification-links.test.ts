import { describe, expect, it } from "vitest";
import { badgeCount, inAppLink } from "./notification-links.ts";

describe("notification links", () => {
  it("follows only links inside the app", () => {
    expect(inAppLink("/app/qa?task=KAN-45")).toBe("/app/qa?task=KAN-45");
    expect(inAppLink("https://evil.example")).toBeNull();
    expect(inAppLink("//evil.example/app/qa")).toBeNull();
    expect(inAppLink("javascript:alert(1)")).toBeNull();
    expect(inAppLink(null)).toBeNull();
  });

  it("caps the unread badge", () => {
    expect(badgeCount(3)).toBe("3");
    expect(badgeCount(12)).toBe("9+");
  });
});
