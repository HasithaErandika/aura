import { describe, expect, it } from "vitest";
import { adfToText, jqlString, textToAdf, toSummary } from "./jira.mapper.js";

describe("Jira mapping", () => {
  it("round-trips plain text through ADF", () => {
    expect(adfToText(textToAdf("first line\nsecond line"))).toBe("first line\nsecond line");
    expect(adfToText({ type: "doc", content: [{ type: "heading", content: [{ type: "text", text: "Title" }] }, { type: "paragraph", content: [{ type: "text", text: "Body" }] }] })).toBe("Title\nBody");
    expect(adfToText(null)).toBe("");
  });

  it("quotes JQL strings", () => {
    expect(jqlString('say "hi" \\ bye')).toBe('"say \\"hi\\" \\\\ bye"');
  });

  it("maps an issue summary with its browse link and status category", () => {
    const summary = toSummary({ key: "KAN-1", fields: { summary: "Login", issuetype: { name: "Story" }, status: { name: "Doing", statusCategory: { key: "indeterminate" } } } }, "https://acme.atlassian.net");
    expect(summary).toMatchObject({ key: "KAN-1", issueType: "Story", statusCategory: "indeterminate", url: "https://acme.atlassian.net/browse/KAN-1", priority: null });
    expect(toSummary({ key: "KAN-2", fields: { status: { statusCategory: { key: "weird" } } } }, undefined)).toMatchObject({ statusCategory: "new", url: null });
  });
});
