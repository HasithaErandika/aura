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

// Finds an MCP tool whose name ends with the given suffix, or throws if Jira isn't available.
function findTool(suffix: string) {
  const name = Object.keys(jiraTools).find((n) => n.toLowerCase().endsWith(suffix));
  const tool = name ? jiraTools[name] : undefined;
  if (!tool?.execute) throw new Error(`Jira is not available: no MCP tool ending in "${suffix}" (is the Jira MCP server configured and running?)`);
  return tool.execute;
}

// Unwraps a JSON string wrapped as { result: "<json>" } by Mastra's MCP proxy.
function unwrapResultString(obj: Record<string, unknown>): Record<string, unknown> {
  if (typeof obj.result === 'string') {
    try {
      const inner = JSON.parse(obj.result);
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) return inner as Record<string, unknown>;
    } catch {
      // obj.result isn't JSON - leave obj as-is.
    }
  }
  return obj;
}

// mcp-atlassian returns either a JSON object or text content; normalise to an object.
function asObject(result: unknown): Record<string, unknown> {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.content) && r.content.length && typeof (r.content[0] as { text?: unknown })?.text === 'string') {
      try {
        return unwrapResultString(JSON.parse((r.content[0] as { text: string }).text) as Record<string, unknown>);
      } catch {
        return { text: (r.content[0] as { text: string }).text };
      }
    }
    return unwrapResultString(r);
  }
  if (typeof result === 'string') {
    try {
      return unwrapResultString(JSON.parse(result) as Record<string, unknown>);
    } catch {
      return { text: result };
    }
  }
  return {};
}

// Same unwrap as asObject() ({content:[{text}]} / {result: "<json>"}), but without its
// object-only restriction - jira_get_transitions returns a JSON *array*, which asObject()
// would silently discard (unwrapResultString only unwraps into an object, never an array).
function unwrapToJson(result: unknown): unknown {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.content) && r.content.length && typeof (r.content[0] as { text?: unknown })?.text === 'string') {
      try {
        return JSON.parse((r.content[0] as { text: string }).text);
      } catch {
        return r;
      }
    }
    if (typeof r.result === 'string') {
      try {
        return JSON.parse(r.result);
      } catch {
        return r;
      }
    }
    return r;
  }
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }
  return result;
}

export interface JiraIssueSummary {
  key: string;
  summary: string;
  description: string;
  status: string;
  issueType: string;
  url: string | null;
}

// Extracts a normalized issue summary from a raw Jira/MCP response shape.
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

// Builds the browsable Jira URL for an issue key.
export function jiraIssueUrl(key: string): string | null {
  const base = process.env.JIRA_URL?.replace(/\/+$/, '');
  return base && key ? `${base}/browse/${key}` : null;
}

export const jira = {
  // Reports whether Jira is configured and its MCP tools loaded.
  isConfigured: () => jiraConfigured && Object.keys(jiraTools).length > 0,

  // Fetches a single Jira issue by key.
  async getIssue(key: string): Promise<JiraIssueSummary> {
    const execute = findTool('_get_issue');
    const raw = asObject(await execute({ issue_key: key, fields: 'summary,description,status,issuetype', comment_limit: 0 }, {}));
    const issue = pickIssue(raw);
    if (!issue.key) throw new Error(`Jira returned no issue for ${key}`);
    return issue;
  },

  // Fetches the Stories filed under an Epic, for the Architect Agent to design against.
  async getEpicStories(epicKey: string): Promise<JiraIssueSummary[]> {
    const execute = findTool('_search');
    const raw = asObject(
      await execute({ jql: `parent = ${epicKey} ORDER BY created ASC`, fields: 'summary,description,status,issuetype', limit: 50 }, {}),
    );
    const issues = Array.isArray(raw.issues) ? raw.issues : [];
    return issues.map((item) => pickIssue(item as Record<string, unknown>)).filter((issue) => issue.key);
  },

  // Creates a Jira issue (Epic/Story/Task), optionally under a parent Epic.
  async createIssue(input: { summary: string; issueType: 'Epic' | 'Story' | 'Task'; description: string; priority?: string; parentKey?: string }): Promise<{ key: string; url: string | null }> {
    if (!jiraProjectKey) throw new Error('JIRA_PROJECT_KEY is not set');
    const execute = findTool('_create_issue');
    const additional: Record<string, unknown> = {};
    if (input.parentKey) additional.parent = input.parentKey;
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
    if (!issue.key) {
      const detail = typeof raw.text === 'string' ? raw.text : JSON.stringify(raw).slice(0, 1000);
      throw new Error(`Jira did not return a key for the created ${input.issueType}. Response: ${detail}`);
    }
    return { key: issue.key, url: issue.url };
  },

  // Updates an existing Jira issue's summary, description, or priority.
  async updateIssue(key: string, fields: { summary?: string; description?: string; priority?: string }): Promise<void> {
    const execute = findTool('_update_issue');
    const body: Record<string, unknown> = {};
    if (fields.summary !== undefined) body.summary = fields.summary;
    if (fields.description !== undefined) body.description = fields.description;
    if (fields.priority !== undefined) body.priority = { name: fields.priority };
    await execute({ issue_key: key, fields: JSON.stringify(body), return_fields: 'key' }, {});
  },

  // Adds a comment to a Jira issue.
  async addComment(key: string, body: string): Promise<void> {
    const execute = findTool('_add_comment');
    await execute({ issue_key: key, body }, {});
  },

  // The moves available from an issue's current status - Jira's own workflow decides what's
  // offered, never AURA (mirrors apps/api/src/modules/jira/jira.client.ts's REST equivalent,
  // used for the human-facing Jira page; this MCP-based one is for agent-triggered moves, e.g.
  // the Dev agent marking a Task "In Progress" when it starts scaffolding).
  async getTransitions(key: string): Promise<{ id: string; name: string }[]> {
    const execute = findTool('_get_transitions');
    const parsed = unwrapToJson(await execute({ issue_key: key }, {}));
    const list = Array.isArray(parsed) ? parsed : [];
    return list
      .map((t) => {
        const row = t as Record<string, unknown>;
        return { id: String(row.id ?? ''), name: String(row.name ?? '') };
      })
      .filter((t) => t.id);
  },

  // Moves an issue through one of those transitions.
  async transitionIssue(key: string, transitionId: string): Promise<void> {
    const execute = findTool('_transition_issue');
    await execute({ issue_key: key, transition_id: transitionId }, {});
  },
};
