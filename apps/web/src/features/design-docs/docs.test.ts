import { describe, expect, it } from "vitest";
import { groupByKind, versionAuthor, type DesignDoc } from "./docs.ts";

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

describe("design documents page helpers", () => {
  it("groups documents in the page's kind order and drops empty kinds", () => {
    const groups = groupByKind([doc("adr", "adr/0002-b"), doc("architecture", "architecture"), doc("adr", "adr/0001-a")], ["architecture", "srs", "adr"]);
    expect(groups.map((g) => [g.kind, g.documents.map((d) => d.slug)])).toEqual([
      ["architecture", ["architecture"]],
      ["adr", ["adr/0001-a", "adr/0002-b"]],
    ]);
  });

  it("names a version's author", () => {
    const base = { version: 1, contentSha256: "", note: null, draftId: null, createdAt: "" };
    expect(versionAuthor({ ...base, authorAgent: "qa-agent", authorId: null })).toBe("QA Agent");
    expect(versionAuthor({ ...base, authorAgent: null, authorId: "u1" }, { u1: "Nimal" })).toBe("Nimal");
  });
});
