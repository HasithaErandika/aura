export type GateStatus = "done" | "current" | "pending" | "blocked";

export interface Gate {
  label: string;
  status: GateStatus;
}

export type RiskTier = "LOW" | "MEDIUM" | "HIGH";

export interface ApprovalRequest {
  id: string;
  title: string;
  issueKey: string;
  role: string;
  requestedBy: string;
  risk: RiskTier;
  waitingSince: string;
}

export type AgentStatus = "ACTIVE" | "CANARY" | "DRAFT" | "DEPRECATED";

export interface AgentSummary {
  name: string;
  version: string;
  status: AgentStatus;
  rejectionRate: string;
}
