import { MCPClient } from '@mastra/mcp';

const jiraMcpUrl = process.env.JIRA_MCP_URL;
const jiraMcpCommand = process.env.JIRA_MCP_COMMAND;
const jiraConfigured = Boolean(jiraMcpUrl || jiraMcpCommand || process.env.JIRA_URL);

export const jiraProjectKey = process.env.JIRA_PROJECT_KEY || '';

// Connects to the Jira MCP server over HTTP/SSE (JIRA_MCP_URL) or stdio (defaults to `uvx mcp-atlassian`).
// Only the delegate tools call Jira, from code, after a human approved the draft. No agent holds
// a Jira tool, so no model can write to Jira on its own (docs/ARCHITECTURE.md section 7).
export const jiraMcp = new MCPClient({
  id: 'jira-mcp',
  servers: {
    jira: jiraMcpUrl
      ? {
          url: new URL(jiraMcpUrl),
          requestInit: process.env.JIRA_MCP_TOKEN
            ? { headers: { Authorization: `Bearer ${process.env.JIRA_MCP_TOKEN}` } }
            : undefined,
        }
      : {
          command: jiraMcpCommand || 'uvx',
          args: process.env.JIRA_MCP_ARGS
            ? process.env.JIRA_MCP_ARGS.split(' ').filter(Boolean)
            : ['mcp-atlassian'],
          env: {
            JIRA_URL: process.env.JIRA_URL || '',
            JIRA_USERNAME: process.env.JIRA_USERNAME || '',
            JIRA_API_TOKEN: process.env.JIRA_API_TOKEN || '',
          },
        },
  },
});

type ToolMap = Record<string, { execute?: (input: unknown, context: unknown) => Promise<unknown> }>;

// Discovers the Jira MCP server's tools once at startup; empty if unconfigured or unreachable.
async function loadJiraTools(): Promise<ToolMap> {
  if (!jiraConfigured) {
    console.warn('[jira-mcp] Not configured - set JIRA_MCP_URL or JIRA_URL/JIRA_USERNAME/JIRA_API_TOKEN in .env. Filing to Jira will fail.');
    return {};
  }
  try {
    const { tools, errors } = await jiraMcp.listToolsWithErrors({ perServerTimeoutMs: 10_000 });
    if (errors.jira) console.warn(`[jira-mcp] Failed to connect: ${errors.jira}`);
    const names = Object.keys(tools);
    if (names.length) console.info(`[jira-mcp] discovered ${names.length} tools`);
    return tools as ToolMap;
  } catch (error) {
    console.warn('[jira-mcp] Failed to load tools:', error);
    return {};
  }
}

const jiraTools = await loadJiraTools();

function findTool(suffix: string) {
  const name = Object.keys(jiraTools).find((n) => n.toLowerCase().endsWith(suffix));
  const tool = name ? jiraTools[name] : undefined;
  if (!tool?.execute) throw new Error(`Jira is not available: no MCP tool ending in "${suffix}" (is the Jira MCP server configured and running?)`);
  return tool.execute;
}

// mcp-atlassian returns either a JSON object or text content; normalise to an object.
function asObject(result: unknown): Record<string, unknown> {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.content) && r.content.length && typeof (r.content[0] as { text?: unknown })?.text === 'string') {
      try {
        return JSON.parse((r.content[0] as { text: string }).text) as Record<string, unknown>;
      } catch {
        return { text: (r.content[0] as { text: string }).text };
      }
    }
    return r;
  }
  if (typeof result === 'string') {
    try {
      return JSON.parse(result) as Record<string, unknown>;
    } catch {
      return { text: result };
    }
  }
  return {};
}

export interface JiraIssueSummary {
  key: string;
  summary: string;
  description: string;
  status: string;
  issueType: string;
  url: string | null;
}

function pickIssue(raw: Record<string, unknown>): JiraIssueSummary {
  const issue = (raw.issue as Record<string, unknown> | undefined) ?? raw;
  const fields = (issue.fields as Record<string, unknown> | undefined) ?? issue;
  const status = fields.status as Record<string, unknown> | string | undefined;
  const type = fields.issuetype ?? fields.issue_type;
  const key = String(issue.key ?? '');
  return {
    key,
    summary: String(fields.summary ?? ''),
    description: typeof fields.description === 'string' ? fields.description : '',
    status: typeof status === 'string' ? status : String((status as Record<string, unknown> | undefined)?.name ?? ''),
    issueType: typeof type === 'string' ? type : String((type as Record<string, unknown> | undefined)?.name ?? ''),
    url: typeof issue.url === 'string' ? issue.url : typeof raw.url === 'string' ? raw.url : jiraIssueUrl(key),
  };
}

export function jiraIssueUrl(key: string): string | null {
  const base = process.env.JIRA_URL?.replace(/\/+$/, '');
  return base && key ? `${base}/browse/${key}` : null;
}

export const jira = {
  isConfigured: () => jiraConfigured && Object.keys(jiraTools).length > 0,

  async getIssue(key: string): Promise<JiraIssueSummary> {
    const execute = findTool('_get_issue');
    const raw = asObject(await execute({ issue_key: key, fields: 'summary,description,status,issuetype', comment_limit: 0 }, {}));
    const issue = pickIssue(raw);
    if (!issue.key) throw new Error(`Jira returned no issue for ${key}`);
    return issue;
  },

  async createIssue(input: { summary: string; issueType: 'Epic' | 'Story'; description: string; priority?: string; parentKey?: string }): Promise<{ key: string; url: string | null }> {
    if (!jiraProjectKey) throw new Error('JIRA_PROJECT_KEY is not set');
    const execute = findTool('_create_issue');
    const additional: Record<string, unknown> = {};
    if (input.parentKey) additional.parent = { key: input.parentKey };
    if (input.priority) additional.priority = { name: input.priority };
    const raw = asObject(
      await execute(
        {
          project_key: jiraProjectKey,
          summary: input.summary,
          issue_type: input.issueType,
          description: input.description,
          additional_fields: JSON.stringify(additional),
        },
        {},
      ),
    );
    const issue = pickIssue(raw);
    if (!issue.key) throw new Error(`Jira did not return a key for the created ${input.issueType}`);
    return { key: issue.key, url: issue.url };
  },

  async addComment(key: string, body: string): Promise<void> {
    const execute = findTool('_add_comment');
    await execute({ issue_key: key, body }, {});
  },
};
