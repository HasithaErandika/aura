import { env } from "../../config/env.js";
import { jiraUnavailable, notFound, upstreamError } from "../../lib/http/errors.js";
import { errorMessage } from "../../lib/logger.js";
import type { JiraComment, JiraIssueDetail, JiraIssueSummary, JiraStatusCategory, JiraTransition } from "./jira.types.js";

// Direct, read-only client for Jira Cloud's REST API (v3). This is deliberately separate from
// apps/agent-runtime's Jira MCP client: that one is for writes, gated behind human approval and
// invoked only by an agent's delegate tool. Browsing Epics/Stories/Tasks in the UI is a plain
// read with no agent involved, so it talks to Jira straight from the API instead of asking the
// runtime to do it - viewing Jira data can never start, or need, an agent run (PO, BA, or
// otherwise).

export const jiraConfigured = Boolean(env.jiraUrl && env.jiraUsername && env.jiraApiToken && env.jiraProjectKey);

function authHeader(): string {
  return `Basic ${Buffer.from(`${env.jiraUsername}:${env.jiraApiToken}`).toString("base64")}`;
}

async function jiraFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!jiraConfigured) throw jiraUnavailable("Jira is not configured - set JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN, JIRA_PROJECT_KEY.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.jiraTimeoutMs);
  let res: Response;
  try {
    res = await fetch(`${env.jiraUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    throw jiraUnavailable(`Jira is unreachable at ${env.jiraUrl}: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    if (res.status === 404) throw notFound("Jira issue");
    const body = await res.text().catch(() => "");
    throw upstreamError(`Jira responded ${res.status} for ${path}`, safeJson(body));
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

// Minimal Atlassian Document Format -> plain text. Good enough for a read-only preview; not a
// full renderer (no marks, tables, media).
interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

const ADF_BLOCK_TYPES = new Set(["paragraph", "heading", "listItem", "codeBlock", "blockquote"]);

function adfToText(node: AdfNode | null | undefined): string {
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

// The reverse of adfToText, minimal: plain text -> one ADF paragraph per line, joined by
// hardBreak - Jira Cloud v3's comment endpoint requires ADF, it does not accept plain text.
function textToAdf(text: string): { type: "doc"; version: 1; content: AdfNode[] } {
  const lines = text.split("\n");
  const content: AdfNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) content.push({ type: "hardBreak" });
    if (line) content.push({ type: "text", text: line });
  });
  return { type: "doc", version: 1, content: [{ type: "paragraph", content }] };
}

interface RawJiraIssue {
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
  };
}

interface RawJiraComment {
  id: string;
  author?: { displayName?: string } | null;
  body?: AdfNode | null;
  created: string;
  updated?: string;
}

function toComment(raw: RawJiraComment): JiraComment {
  return {
    id: raw.id,
    author: raw.author?.displayName ?? null,
    body: adfToText(raw.body),
    created: raw.created,
    updated: raw.updated ?? null,
  };
}

function issueUrl(key: string): string | null {
  return env.jiraUrl ? `${env.jiraUrl}/browse/${key}` : null;
}

function toStatusCategory(raw: string | undefined): JiraStatusCategory {
  return raw === "done" || raw === "indeterminate" ? raw : "new";
}

function toSummary(raw: RawJiraIssue): JiraIssueSummary {
  return {
    key: raw.key,
    summary: raw.fields.summary ?? "",
    issueType: raw.fields.issuetype?.name ?? "",
    status: raw.fields.status?.name ?? "",
    statusCategory: toStatusCategory(raw.fields.status?.statusCategory?.key),
    priority: raw.fields.priority?.name ?? null,
    assignee: raw.fields.assignee?.displayName ?? null,
    updated: raw.fields.updated ?? null,
    url: issueUrl(raw.key),
  };
}

function toDetail(raw: RawJiraIssue): JiraIssueDetail {
  return {
    ...toSummary(raw),
    description: adfToText(raw.fields.description),
    created: raw.fields.created ?? null,
    reporter: raw.fields.reporter?.displayName ?? null,
  };
}

const SUMMARY_FIELDS = "summary,issuetype,status,priority,assignee,updated";
const DETAIL_FIELDS = `${SUMMARY_FIELDS},created,reporter,description`;

// /rest/api/3/search was removed by Atlassian in favor of /rest/api/3/search/jql
// (https://developer.atlassian.com/changelog/#CHANGE-2046).
async function search(jql: string, fields: string, maxResults: number): Promise<RawJiraIssue[]> {
  const params = new URLSearchParams({ jql, fields, maxResults: String(maxResults) });
  const { issues } = await jiraFetch<{ issues: RawJiraIssue[] }>(`/rest/api/3/search/jql?${params.toString()}`);
  return issues ?? [];
}

// Jira JQL string literal quoting (backslash and double-quote are the only characters that
// need escaping inside a quoted JQL string).
function jqlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export const jira = {
  isConfigured: () => jiraConfigured,

  async listEpics(q?: string): Promise<JiraIssueSummary[]> {
    const project = jqlString(env.jiraProjectKey ?? "");
    const clauses = [`project = ${project}`, "issuetype = Epic"];
    if (q?.trim()) clauses.push(`summary ~ ${jqlString(`${q.trim()}*`)}`);
    const jql = `${clauses.join(" AND ")} ORDER BY updated DESC`;
    const issues = await search(jql, SUMMARY_FIELDS, 100);
    return issues.map(toSummary);
  },

  async getEpic(epicKey: string): Promise<JiraIssueDetail> {
    const raw = await jiraFetch<RawJiraIssue>(`/rest/api/3/issue/${encodeURIComponent(epicKey)}?fields=${DETAIL_FIELDS}`);
    return toDetail(raw);
  },

  // Stories, Tasks, and Bugs are all parented directly to their Epic (delegate-tools.ts
  // `parentKey: epicKey` for Stories/Tasks; the Tester Agent's Gate 7 file-defect mode for
  // Bugs), so one JQL query covers all three.
  async getEpicChildren(epicKey: string): Promise<{ stories: JiraIssueSummary[]; tasks: JiraIssueSummary[]; bugs: JiraIssueSummary[] }> {
    const jql = `parent = ${jqlString(epicKey)} ORDER BY created ASC`;
    const issues = await search(jql, SUMMARY_FIELDS, 200);
    const summaries = issues.map(toSummary);
    return {
      stories: summaries.filter((i) => i.issueType === "Story"),
      tasks: summaries.filter((i) => i.issueType === "Task"),
      bugs: summaries.filter((i) => i.issueType === "Bug"),
    };
  },

  async getIssue(key: string): Promise<JiraIssueDetail> {
    const raw = await jiraFetch<RawJiraIssue>(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${DETAIL_FIELDS}`);
    return toDetail(raw);
  },

  // The moves actually available from an issue's current status - Jira's own workflow decides
  // this, not AURA, so the UI only ever offers transitions Jira itself would allow.
  async getTransitions(key: string): Promise<JiraTransition[]> {
    const { transitions } = await jiraFetch<{ transitions: { id: string; name: string; to?: { name?: string } }[] }>(
      `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
    );
    return (transitions ?? []).map((t) => ({ id: t.id, name: t.name, toStatus: t.to?.name ?? t.name }));
  },

  // Moves an issue through one of its available transitions - a direct human action (like
  // dragging a card on a Jira board), not an agent write; no gate needed.
  async transitionIssue(key: string, transitionId: string): Promise<void> {
    await jiraFetch<undefined>(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
      method: "POST",
      body: { transition: { id: transitionId } },
    });
  },

  // An issue's comment thread, oldest first - includes both human comments and any AURA-agent
  // provenance-stamped comments (Gate 3/4/5/6/7's own `jira.addComment` calls), so this is the
  // one place both show up together.
  async getComments(key: string): Promise<JiraComment[]> {
    const { comments } = await jiraFetch<{ comments: RawJiraComment[] }>(
      `/rest/api/3/issue/${encodeURIComponent(key)}/comment?orderBy=created`,
    );
    return (comments ?? []).map(toComment);
  },

  // Posts a plain-text comment - a direct human action, not an agent write; no gate needed
  // (matches transitionIssue's own reasoning).
  async addComment(key: string, body: string): Promise<JiraComment> {
    const raw = await jiraFetch<RawJiraComment>(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
      method: "POST",
      body: { body: textToAdf(body) },
    });
    return toComment(raw);
  },
};
