import { env } from "../../config/env.js";
import { jiraUnavailable, notFound, upstreamError } from "../../lib/http/errors.js";
import { safeJson } from "../../lib/json.js";
import { errorMessage } from "../../lib/logger.js";
import { jqlString, textToAdf, toComment, toDetail, toSummary, type RawJiraComment, type RawJiraIssue } from "./jira.mapper.js";
import { chooseTransition, type StatusMove } from "./jira.status.js";
import type { JiraComment, JiraEpicDetail, JiraIssueDetail, JiraIssueSummary, JiraTransition } from "./jira.types.js";

const SUMMARY_FIELDS = "summary,issuetype,status,priority,assignee,updated";
const DETAIL_FIELDS = `${SUMMARY_FIELDS},created,reporter,description`;
const SEARCH_PAGE_SIZE = 100;
const MAX_SEARCH_PAGES = 100;

export const jiraConfigured = Boolean(env.jiraUrl && env.jiraUsername && env.jiraApiToken && env.jiraProjectKey);

async function jiraFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!jiraConfigured) throw jiraUnavailable("Jira is not configured - set JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN, JIRA_PROJECT_KEY.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.jiraTimeoutMs);
  let res: Response;
  try {
    res = await fetch(`${env.jiraUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.jiraUsername}:${env.jiraApiToken}`).toString("base64")}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    throw jiraUnavailable(`Jira is unreachable at ${env.jiraUrl}: ${errorMessage(error)}`);
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 404) throw notFound("Jira issue");
  if (!res.ok) throw upstreamError(`Jira responded ${res.status} for ${path}`, safeJson(await res.text().catch(() => "")));
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// isLast, not the page length, ends the search: Jira may return short pages mid-way.
async function search(jql: string, maxResults: number): Promise<RawJiraIssue[]> {
  const issues: RawJiraIssue[] = [];
  let nextPageToken: string | undefined;
  for (let page = 0; page < MAX_SEARCH_PAGES; page += 1) {
    const response = await jiraFetch<{ issues?: RawJiraIssue[]; nextPageToken?: string; isLast?: boolean }>("/rest/api/3/search/jql", {
      method: "POST",
      body: { jql, fields: SUMMARY_FIELDS.split(","), maxResults: Math.min(maxResults - issues.length, SEARCH_PAGE_SIZE), ...(nextPageToken ? { nextPageToken } : {}) },
    });
    issues.push(...(response.issues ?? []));
    if (response.isLast !== false || !response.nextPageToken || issues.length >= maxResults) break;
    nextPageToken = response.nextPageToken;
  }
  return issues.slice(0, maxResults);
}

const issuePath = (key: string, suffix = "") => `/rest/api/3/issue/${encodeURIComponent(key)}${suffix}`;

export const jira = {
  async listEpics(q?: string): Promise<JiraIssueSummary[]> {
    const clauses = [`project = ${jqlString(env.jiraProjectKey ?? "")}`, "issuetype = Epic"];
    if (q?.trim()) clauses.push(`summary ~ ${jqlString(`${q.trim()}*`)}`);
    const issues = await search(`${clauses.join(" AND ")} ORDER BY updated DESC`, 100);
    return issues.map((issue) => toSummary(issue, env.jiraUrl));
  },

  async getIssue(key: string): Promise<JiraIssueDetail> {
    return toDetail(await jiraFetch<RawJiraIssue>(issuePath(key, `?fields=${DETAIL_FIELDS}`)), env.jiraUrl);
  },

  async getEpic(epicKey: string): Promise<JiraEpicDetail> {
    const [epic, children] = await Promise.all([jira.getIssue(epicKey), search(`parent = ${jqlString(epicKey)} ORDER BY created ASC`, 200)]);
    const summaries = children.map((issue) => toSummary(issue, env.jiraUrl));
    const ofType = (type: string) => summaries.filter((i) => i.issueType === type);
    return { epic, stories: ofType("Story"), tasks: ofType("Task"), bugs: ofType("Bug") };
  },

  async getTransitions(key: string): Promise<JiraTransition[]> {
    const { transitions } = await jiraFetch<{ transitions?: { id: string; name: string; to?: { name?: string } }[] }>(issuePath(key, "/transitions"));
    return (transitions ?? []).map((t) => ({ id: t.id, name: t.name, toStatus: t.to?.name ?? t.name }));
  },

  async transitionIssue(key: string, transitionId: string): Promise<void> {
    await jiraFetch(issuePath(key, "/transitions"), { method: "POST", body: { transition: { id: transitionId } } });
  },

  // The Task's status after the move, or why it did not move.
  async moveToStatus(key: string, target: string, order: readonly string[]): Promise<{ from: string; outcome: StatusMove["kind"] }> {
    const [issue, transitions] = await Promise.all([jira.getIssue(key), jira.getTransitions(key)]);
    const move = chooseTransition(issue.status, target, transitions, order);
    if (move.kind === "move") await jira.transitionIssue(key, move.transitionId);
    return { from: issue.status, outcome: move.kind };
  },

  async getEpicTaskKeys(epicKey: string): Promise<string[]> {
    return (await jira.getEpic(epicKey)).tasks.map((t) => t.key);
  },

  async getComments(key: string): Promise<JiraComment[]> {
    const { comments } = await jiraFetch<{ comments?: RawJiraComment[] }>(issuePath(key, "/comment?orderBy=created"));
    return (comments ?? []).map(toComment);
  },

  async addComment(key: string, body: string): Promise<JiraComment> {
    return toComment(await jiraFetch<RawJiraComment>(issuePath(key, "/comment"), { method: "POST", body: { body: textToAdf(body) } }));
  },
};
