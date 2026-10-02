import type { Role } from "@/shared/lib/roles.ts";

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role | null;
  roleLabel: string | null;
  lastSignInAt: string | null;
  createdAt: string;
}

export interface TokenUsageReport {
  since: string;
  days: number;
  totals: { calls: number; input: number; output: number; reasoning: number; cached: number };
  agents: { agent: string; calls: number; input: number; output: number; reasoning: number; cached: number; avgInput: number; avgOutput: number; share: number }[];
  models: { model: string; calls: number; input: number; output: number }[];
  contextSaved: { chars: number; approxTokens: number };
}

export interface AgentQualityRow {
  agent: string;
  gates: number;
  decided: number;
  approve: number;
  revise: number;
  reject: number;
  answer: number;
  expired: number;
  pending: number;
  approvalRate: number | null;
  firstPassRate: number | null;
  medianDecisionMinutes: number | null;
}

export type RepositoryProvider = "github" | "local";

export interface Repository {
  id: string;
  provider: RepositoryProvider;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  installationId: number | null;
  createdAt: string;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  jiraProjectKey: string;
  createdAt: string;
  repository: Repository | null;
}
