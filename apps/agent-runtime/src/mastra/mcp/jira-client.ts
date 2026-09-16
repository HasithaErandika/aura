import { MCPClient } from '@mastra/mcp';
import { z } from 'zod';

const jiraMcpUrl = process.env.JIRA_MCP_URL;
const jiraMcpCommand = process.env.JIRA_MCP_COMMAND;
const jiraConfigured = Boolean(jiraMcpUrl || jiraMcpCommand || process.env.JIRA_URL);

// Connects to the Jira MCP server over HTTP/SSE (JIRA_MCP_URL) or stdio (defaults to `uvx mcp-atlassian`).
// This is a direct connection for now - see docs/ARCHITECTURE.md §7 (Tool gateway) for the
// policy-checked path this should route through once apps/api's tool gateway exists.
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

type ToolMap = Record<string, any>;

// Jira REST fields that are pure noise for a model (avatar URLs, HATEOAS links, etc).
const NOISY_KEYS = new Set([
  'avatarUrls',
  'avatarUrl',
  'iconUrl',
  'self',
  '_links',
  'expand',
  'renderedFields',
  'operations',
  'editmeta',
  'changelog',
  'watches',
  'votes',
  'worklog',
  'properties',
  'schema',
]);
const MAX_ARRAY_ITEMS = 25;

// Recursively drops NOISY_KEYS and caps array length in a raw Jira result.
function trimJiraValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (Array.isArray(value)) {
    const trimmed = value.slice(0, MAX_ARRAY_ITEMS).map((item) => trimJiraValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      trimmed.push(`...${value.length - MAX_ARRAY_ITEMS} more omitted`);
    }
    return trimmed;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (NOISY_KEYS.has(key)) continue;
      out[key] = trimJiraValue(val, depth + 1);
    }
    return out;
  }
  return value;
}

// Wraps a tool so its model-facing output is trimmed, leaving the raw result for application code.
function withTrimmedOutput(tool: ToolMap[string]): ToolMap[string] {
  return {
    ...tool,
    toModelOutput: (output: unknown) => ({ type: 'json', value: trimJiraValue(output) }),
  };
}

// Explicit Zod schemas for the Jira tools we use, sidestepping a Mastra bug where MCP-native
// JSON Schema wrongly marks optional fields as required.
const ZOD_INPUT_SCHEMAS: Record<string, z.ZodType> = {
  jira_jira_create_issue: z.object({
    project_key: z.string(),
    summary: z.string(),
    issue_type: z.string(),
    assignee: z.string().optional(),
    description: z.string().optional(),
    components: z.string().optional(),
    additional_fields: z.string().optional(),
  }),
  jira_jira_get_issue: z.object({
    issue_key: z.string(),
    fields: z.string().optional(),
    expand: z.string().optional(),
    comment_limit: z.number().int().min(0).max(100).optional(),
    properties: z.string().optional(),
    update_history: z.boolean().optional(),
    include: z.string().optional(),
    use_display_names: z.boolean().optional(),
  }),
  jira_jira_add_comment: z.object({
    issue_key: z.string(),
    body: z.string(),
    visibility: z.string().optional(),
    public: z.boolean().optional(),
  }),
};

// Swaps in a tool's entry from ZOD_INPUT_SCHEMAS when one exists, otherwise leaves it untouched.
function withZodInputSchema(tool: ToolMap[string], name: string): ToolMap[string] {
  const schema = ZOD_INPUT_SCHEMAS[name];
  if (!schema) return tool;
  return { ...tool, inputSchema: schema };
}

// Scopes a Jira toolset to one agent's job, via an explicit env allowlist or a keyword fallback.
function pickTools(tools: ToolMap, allowlistEnv: string | undefined, keywords: string[]): ToolMap {
  const names = Object.keys(tools);
  if (!names.length) return {};

  const explicit = allowlistEnv
    ?.split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (explicit?.length) {
    const picked: ToolMap = {};
    for (const name of explicit) {
      if (tools[name]) picked[name] = tools[name];
    }
    return picked;
  }

  // Anchored suffix match against the tool's own name, not a loose substring/description search -
  // mcp-atlassian exposes many "get_issue_*" and "search_*" variants (watchers, sla, proforma_forms,
  // assignable_users, ...) that a loose "get_issue"/"search" substring would wrongly pull in.
  const picked: ToolMap = {};
  for (const name of names) {
    const lower = name.toLowerCase();
    if (keywords.some((suffix) => lower.endsWith(suffix))) picked[name] = tools[name];
  }
  if (!Object.keys(picked).length) {
    console.warn(
      `[jira-mcp] no tools matched the default suffix filter out of: ${names.join(', ')}. ` +
        'Set JIRA_PO_TOOLS / JIRA_BA_TOOLS to an explicit comma-separated allowlist.',
    );
  }
  return picked;
}

// PO drafts and files Epics: create-issue only.
const PO_SUFFIXES = ['_create_issue'];
// BA reads the approved Epic, files Stories under it, and comments: create + read + search + comment.
const BA_SUFFIXES = ['_create_issue', '_batch_create_issues', '_get_issue', '_search', '_add_comment'];

// Discovers the Jira MCP server's tools once at startup; returns empty if unconfigured or unreachable.
async function loadJiraTools(): Promise<ToolMap> {
  if (!jiraConfigured) {
    console.warn(
      '[jira-mcp] Not configured - set JIRA_MCP_URL or JIRA_URL/JIRA_USERNAME/JIRA_API_TOKEN in .env. Jira tools will be unavailable.',
    );
    return {};
  }

  try {
    const { tools, errors } = await jiraMcp.listToolsWithErrors({ perServerTimeoutMs: 10_000 });
    if (errors.jira) {
      console.warn(`[jira-mcp] Failed to connect: ${errors.jira}`);
    }
    const names = Object.keys(tools);
    if (names.length) {
      console.info(`[jira-mcp] discovered tools: ${names.join(', ')}`);
    }
    return Object.fromEntries(
      names.map((name) => [name, withZodInputSchema(withTrimmedOutput(tools[name]), name)]),
    );
  } catch (error) {
    console.warn('[jira-mcp] Failed to load tools:', error);
    return {};
  }
}

const allJiraTools = await loadJiraTools();

// Per-agent Jira toolsets: PO gets create-issue only (Epics), BA gets read/create/comment (Stories).
export const jiraPoTools = pickTools(allJiraTools, process.env.JIRA_PO_TOOLS, PO_SUFFIXES);
export const jiraBaTools = pickTools(allJiraTools, process.env.JIRA_BA_TOOLS, BA_SUFFIXES);
