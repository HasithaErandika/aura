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

function auraMode(): "local" | "server" {
  const mode = process.env.AURA_MODE?.trim() || "local";
  if (mode !== "local" && mode !== "server") throw new Error(`AURA_MODE must be "local" or "server", got "${mode}"`);
  return mode;
}

function runtimeToken(mode: "local" | "server"): string | undefined {
  const token = optionalString("MASTRA_RUNTIME_TOKEN");
  if (!token && mode === "server") throw new Error("AURA_MODE=server requires MASTRA_RUNTIME_TOKEN (same value in apps/agent-runtime/.env)");
  return token;
}

const mode = auraMode();
if (mode === "server" && !optionalString("DATABASE_URL")) {
  throw new Error("AURA_MODE=server requires DATABASE_URL (Postgres for the turn queue)");
}

export const env = {
  mode,
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
  runtimeToken: runtimeToken(mode),
  runTurnTimeoutMs: optionalNumber("RUN_TURN_TIMEOUT_MS", 10 * 60_000),
  databaseUrl: optionalString("DATABASE_URL"),
  turnConcurrency: optionalNumber("TURN_CONCURRENCY", 4),
  turnConcurrencyPerUser: optionalNumber("TURN_CONCURRENCY_PER_USER", 2),
  approvalSlaHours: optionalNumber("APPROVAL_SLA_HOURS", 72),
  ciOidcAudience: process.env.AURA_CI_AUDIENCE ?? "aura",

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
