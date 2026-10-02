import { describe, expect, it } from "vitest";
import { createProjectSchema, memberSchema, repositorySchema } from "./projects.schemas.js";

describe("createProjectSchema", () => {
  it("upper-cases keys and accepts a valid project", () => {
    expect(createProjectSchema.parse({ key: "resetpw", name: " Reset password ", jiraProjectKey: "kan" })).toEqual({
      key: "RESETPW",
      name: "Reset password",
      jiraProjectKey: "KAN",
    });
  });

  it("rejects bad keys and extra fields", () => {
    expect(createProjectSchema.safeParse({ key: "1AB", name: "x", jiraProjectKey: "KAN" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ key: "A", name: "x", jiraProjectKey: "KAN" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ key: "AB-C", name: "x", jiraProjectKey: "KAN" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ key: "ABC", name: "x", jiraProjectKey: "KAN", id: "x" }).success).toBe(false);
  });
});

describe("repositorySchema", () => {
  it("defaults the branch to main", () => {
    expect(repositorySchema.parse({ provider: "local", owner: "acme", name: "shop" })).toEqual({
      provider: "local",
      owner: "acme",
      name: "shop",
      defaultBranch: "main",
    });
  });

  it("accepts a GitHub repository with an installation id", () => {
    expect(repositorySchema.safeParse({ provider: "github", owner: "acme-inc", name: "shop.web", defaultBranch: "release/1.x", installationId: 42 }).success).toBe(true);
  });

  it("rejects path tricks in owner and name", () => {
    for (const [owner, name] of [["..", "shop"], ["acme", ".."], ["acme/x", "shop"], ["acme", "shop/x"], [".acme", "shop"]]) {
      expect(repositorySchema.safeParse({ provider: "local", owner, name }).success, `${owner}/${name}`).toBe(false);
    }
  });

  it("rejects invalid branch names", () => {
    for (const defaultBranch of ["-main", "main/", "a..b", "a b", "a~1", "x.lock", "a//b", "@{u}"]) {
      expect(repositorySchema.safeParse({ provider: "local", owner: "acme", name: "shop", defaultBranch }).success, defaultBranch).toBe(false);
    }
  });

  it("allows an installation id only for GitHub", () => {
    expect(repositorySchema.safeParse({ provider: "local", owner: "acme", name: "shop", installationId: 1 }).success).toBe(false);
  });
});

describe("project members", () => {
  it("adds a member by user id only", () => {
    expect(memberSchema.parse({ userId: "33333333-3333-4333-8333-333333333333" })).toEqual({ userId: "33333333-3333-4333-8333-333333333333" });
    expect(() => memberSchema.parse({ userId: "someone@acme.test" })).toThrow();
    expect(() => memberSchema.parse({ userId: "33333333-3333-4333-8333-333333333333", role: "admin" })).toThrow();
  });
});
