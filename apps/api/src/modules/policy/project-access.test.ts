import { describe, expect, it } from "vitest";
import { canUseProject } from "./policy.js";

const P = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

describe("project access (step 4.1)", () => {
  it("lets members use their project and nobody else's", () => {
    expect(canUseProject({ id: "u1", role: "developer" }, P, new Set([P]))).toBe(true);
    expect(canUseProject({ id: "u1", role: "developer" }, P, new Set([other]))).toBe(false);
    expect(canUseProject({ id: "u1", role: "project_owner" }, P, new Set())).toBe(false);
  });

  it("lets admins use every project", () => {
    expect(canUseProject({ id: "a", role: "admin" }, P, new Set())).toBe(true);
  });

  it("scopes nothing before a project is registered", () => {
    expect(canUseProject({ id: "u1", role: "developer" }, null, new Set())).toBe(true);
  });
});
