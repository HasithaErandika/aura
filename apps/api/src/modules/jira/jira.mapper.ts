import type { JiraComment, JiraIssueDetail, JiraIssueSummary, JiraStatusCategory } from "./jira.types.js";

export interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

export interface RawJiraIssue {
  key: string;
  fields: {
    summary?: string;
    issuetype?: { name?: string };
    status?: { name?: string; statusCategory?: { key?: string } };
    priority?: { name?: string } | null;
    assignee?: { displayName?: string } | null;
    reporter?: { displayName?: string } | null;
    updated?: string;
    created?: string;
    description?: AdfNode | null;
    parent?: { key?: string } | null;
  };
}

export interface RawJiraComment {
  id: string;
  author?: { displayName?: string } | null;
  body?: AdfNode | null;
  created: string;
  updated?: string;
}

const ADF_BLOCK_TYPES = new Set(["paragraph", "heading", "listItem", "codeBlock", "blockquote"]);

// Plain-text preview only: no marks, tables or media.
export function adfToText(node: AdfNode | null | undefined): string {
  if (!node) return "";
  let out = "";
  const walk = (n: AdfNode) => {
    if (n.type === "text" && n.text) out += n.text;
    if (n.type === "hardBreak") out += "\n";
    for (const child of n.content ?? []) walk(child);
    if (n.type && ADF_BLOCK_TYPES.has(n.type)) out += "\n";
  };
  walk(node);
  return out.trim();
}

export function textToAdf(text: string): { type: "doc"; version: 1; content: AdfNode[] } {
  const content: AdfNode[] = [];
  text.split("\n").forEach((line, i) => {
    if (i > 0) content.push({ type: "hardBreak" });
    if (line) content.push({ type: "text", text: line });
  });
  return { type: "doc", version: 1, content: [{ type: "paragraph", content }] };
}

export function jqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function toStatusCategory(raw: string | undefined): JiraStatusCategory {
  return raw === "done" || raw === "indeterminate" ? raw : "new";
}

export function toSummary(raw: RawJiraIssue, baseUrl: string | undefined): JiraIssueSummary {
  return {
    key: raw.key,
    summary: raw.fields.summary ?? "",
    issueType: raw.fields.issuetype?.name ?? "",
    status: raw.fields.status?.name ?? "",
    statusCategory: toStatusCategory(raw.fields.status?.statusCategory?.key),
    priority: raw.fields.priority?.name ?? null,
    assignee: raw.fields.assignee?.displayName ?? null,
    updated: raw.fields.updated ?? null,
    url: baseUrl ? `${baseUrl}/browse/${raw.key}` : null,
  };
}

export function toDetail(raw: RawJiraIssue, baseUrl: string | undefined): JiraIssueDetail {
  return { ...toSummary(raw, baseUrl), description: adfToText(raw.fields.description), created: raw.fields.created ?? null, reporter: raw.fields.reporter?.displayName ?? null, parentKey: raw.fields.parent?.key ?? null };
}

export function toComment(raw: RawJiraComment): JiraComment {
  return { id: raw.id, author: raw.author?.displayName ?? null, body: adfToText(raw.body), created: raw.created, updated: raw.updated ?? null };
}
