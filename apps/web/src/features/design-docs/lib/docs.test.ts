import { describe, expect, it } from "vitest";
import type { DesignDoc } from "../types.ts";
import { firstDocument, groupByKind, normalizeKey, versionAuthor } from "./docs.ts";

const doc = (kind: DesignDoc["kind"], slug: string): DesignDoc => ({
  id: slug,
  epicKey: "KAN-36",
  kind,
  slug,
  title: slug,
  issueKey: null,
  currentVersion: 1,
  createdBy: null,
  createdByAgent: "architect-agent",
  createdAt: "",
  updatedAt: "",
});

describe("groupByKind", () => {
  it("groups in the page's kind order and drops empty kinds", () => {
    const groups = groupByKind([doc("adr", "adr/0002-b"), doc("architecture", "architecture"), doc("adr", "adr/0001-a")], ["architecture", "srs", "adr"]);
    expect(groups.map((g) => [g.kind, g.documents.map((d) => d.slug)])).toEqual([
      ["architecture", ["architecture"]],
      ["adr", ["adr/0001-a", "adr/0002-b"]],
    ]);
  });

  it("picks the first document in page order", () => {
    expect(firstDocument([doc("adr", "adr/1"), doc("srs", "srs")], ["architecture", "srs", "adr"])?.slug).toBe("srs");
    expect(firstDocument([], ["adr"])).toBeNull();
  });
});

describe("versionAuthor", () => {
  it("names agents and people", () => {
    expect(versionAuthor({ authorAgent: "qa-agent", authorId: null })).toBe("QA Agent");
    expect(versionAuthor({ authorAgent: null, authorId: "u1" }, { u1: "Nimal" })).toBe("Nimal");
    expect(versionAuthor({ authorAgent: null, authorId: null })).toBe("Unknown");
  });
});

describe("normalizeKey", () => {
  it("trims and upper-cases keys", () => {
    expect(normalizeKey(" kan-1 ")).toBe("KAN-1");
    expect(normalizeKey("  ")).toBeNull();
    expect(normalizeKey(null)).toBeNull();
  });
});
