import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalString(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  port: optionalNumber("PORT", 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  webOrigin: required("WEB_ORIGIN").split(",").map((o) => o.trim()).filter(Boolean),
  // Number of reverse proxies in front of the API (Express "trust proxy" hops) so rate
  // limits key on the real client address. 0 when the API is reached directly.
  trustProxyHops: optionalNumber("TRUST_PROXY_HOPS", 0),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? "256kb",

  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  // Optional. When set, access tokens are verified locally (HS256) instead of a round trip
  // to Supabase Auth on every cache miss. Project Settings -> API -> JWT Secret.
  supabaseJwtSecret: optionalString("SUPABASE_JWT_SECRET"),
  sessionCacheTtlMs: optionalNumber("SESSION_CACHE_TTL_MS", 30_000),

  // apps/agent-runtime (Mastra server). The API is the only caller; the browser never
  // talks to the runtime directly (docs/ARCHITECTURE.md section 3.2).
  runtimeUrl: (process.env.MASTRA_RUNTIME_URL ?? "http://localhost:4111").replace(/\/+$/, ""),
  runtimeTimeoutMs: optionalNumber("MASTRA_RUNTIME_TIMEOUT_MS", 15_000),
  // Optional bearer token sent to the runtime when it is deployed behind auth.
  runtimeToken: optionalString("MASTRA_RUNTIME_TOKEN"),
  // Hard ceiling on one agent turn; a hung model call cannot hold a connection forever.
  runTurnTimeoutMs: optionalNumber("RUN_TURN_TIMEOUT_MS", 10 * 60_000),

  // Human approval SLA. A pending gate older than this expires; it is never auto-approved
  // (FR-APPR-5).
  approvalSlaHours: optionalNumber("APPROVAL_SLA_HOURS", 72),

  // Direct, read-only Jira Cloud REST access for browsing Epics/Stories/Tasks (same
  // credentials the agent-runtime's Jira MCP uses to write). The API talks to Jira itself
  // for this - it never asks the runtime or an agent to do it, so viewing Jira data can
  // never trigger an agent run.
  jiraUrl: optionalString("JIRA_URL")?.replace(/\/+$/, ""),
  jiraUsername: optionalString("JIRA_USERNAME"),
  jiraApiToken: optionalString("JIRA_API_TOKEN"),
  jiraProjectKey: optionalString("JIRA_PROJECT_KEY"),
  jiraTimeoutMs: optionalNumber("JIRA_TIMEOUT_MS", 10_000),

  // At-rest encryption for user-supplied coding-agent API keys (modules/credentials,
  // lib/crypto.ts). Base64, must decode to exactly 32 bytes - generate with
  // `openssl rand -base64 32`. Never set by AURA itself; the operator sets it.
  credentialsEncryptionKey: required("CREDENTIALS_ENCRYPTION_KEY"),
  // Shared secret for apps/agent-runtime's internal-only calls back to this API
  // (modules/credentials/internal.router.ts) to fetch a decrypted coding-agent credential
  // just-in-time. Not the same as MASTRA_RUNTIME_TOKEN (that one is API -> runtime; this one
  // is runtime -> API, the one reverse call this system makes).
  runtimeInternalToken: required("RUNTIME_INTERNAL_TOKEN"),

  // Rate limits (requests per window, per client)
  rateLimit: {
    windowMs: optionalNumber("RATE_LIMIT_WINDOW_MS", 60_000),
    perIp: optionalNumber("RATE_LIMIT_PER_IP", 600),
    perUser: optionalNumber("RATE_LIMIT_PER_USER", 300),
    agentTurnsPerUser: optionalNumber("RATE_LIMIT_AGENT_TURNS_PER_USER", 30),
  },
};
