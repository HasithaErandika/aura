export const paths = {
  landing: "/",
  login: "/login",
  dashboard: "/app",
  workspace: "/app/workspace",
  workspaceThread: (threadId: string) => `/app/workspace/${threadId}`,
  approvals: "/app/approvals",
  approval: (id: string) => `/app/approvals/${id}`,
  runs: "/app/runs",
  run: (id: string) => `/app/runs/${id}`,
  registry: "/app/agents",
  audit: "/app/audit",
  users: "/app/admin/users",
} as const;
