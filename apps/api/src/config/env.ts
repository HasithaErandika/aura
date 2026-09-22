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
  trustProxyHops: optionalNumber("TRUST_PROXY_HOPS", 0),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? "256kb",

  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseJwtSecret: optionalString("SUPABASE_JWT_SECRET"),
  
  sessionCacheTtlMs: optionalNumber("SESSION_CACHE_TTL_MS", 30_000),
  runtimeUrl: (process.env.MASTRA_RUNTIME_URL ?? "http://localhost:4111").replace(/\/+$/, ""),
  runtimeTimeoutMs: optionalNumber("MASTRA_RUNTIME_TIMEOUT_MS", 15_000),
  runtimeToken: optionalString("MASTRA_RUNTIME_TOKEN"),
  runTurnTimeoutMs: optionalNumber("RUN_TURN_TIMEOUT_MS", 10 * 60_000),
  approvalSlaHours: optionalNumber("APPROVAL_SLA_HOURS", 72),
  
  jiraUrl: optionalString("JIRA_URL")?.replace(/\/+$/, ""),
  jiraUsername: optionalString("JIRA_USERNAME"),
  jiraApiToken: optionalString("JIRA_API_TOKEN"),
  jiraProjectKey: optionalString("JIRA_PROJECT_KEY"),
  jiraTimeoutMs: optionalNumber("JIRA_TIMEOUT_MS", 10_000),

  rateLimit: {
    windowMs: optionalNumber("RATE_LIMIT_WINDOW_MS", 60_000),
    perIp: optionalNumber("RATE_LIMIT_PER_IP", 600),
    perUser: optionalNumber("RATE_LIMIT_PER_USER", 300),
    agentTurnsPerUser: optionalNumber("RATE_LIMIT_AGENT_TURNS_PER_USER", 30),
  },
};
