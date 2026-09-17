import type { Role } from "../identity/roles.js";
import { forbidden } from "../../lib/http/errors.js";

// Deterministic authorization data (docs/ARCHITECTURE.md section 4, FR-AUTH-3/4).
//
// This module never decides *what the workflow does next*. The Orchestrator in
// apps/agent-runtime decides that dynamically: which agent to delegate to, when to ask a
// human, when to file in Jira. The API only observes those events and answers two questions
// in code, outside the model:
//   1. May this role start a conversation with this agent?
//   2. When the runtime pauses to ask a human, which role is allowed to answer?
// Both answers are lookups in the tables below, so adding an agent later is a data change.

export type AgentAccess = "run" | "read";

// The runtime registers agents under their Agent id ("po-agent"), while the Orchestrator's
// delegation tools use a short name ("delegate_to_po"). Every lookup below goes through
// canonicalAgentId so both spellings resolve to the runtime id.
export const AGENT_ALIASES: Record<string, string> = {
  po: "po-agent",
  ba: "ba-agent",
};

export function canonicalAgentId(agentId: string): string {
  return AGENT_ALIASES[agentId] ?? agentId;
}

// Role -> agent -> access. Any agent the runtime exposes that is missing from a role's row is
// denied for that role (default deny). Admins can read everything and run nothing.
export const ROLE_AGENT_GRANTS: Record<Role, Record<string, AgentAccess>> = {
  project_owner: { orchestrator: "run", "po-agent": "run", "ba-agent": "read" },
  business_analyst: { orchestrator: "run", "ba-agent": "run", "po-agent": "read" },
  admin: { orchestrator: "read", "po-agent": "read", "ba-agent": "read" },
  architect: { "ba-agent": "read" },
  developer: {},
  qa_engineer: {},
  tester: {},
  deployer: {},
};

// Which human role signs off on an agent's output when the Orchestrator pauses after
// delegating to it (section 4.2 "Approves" column, section 5.1 gates). A question raised
// before any delegation, or after delegating to an agent not listed here, goes back to the
// person who started the run.
export const AGENT_APPROVER_ROLE: Record<string, Role> = {
  "po-agent": "project_owner",
  "ba-agent": "business_analyst",
};

// Human-readable gate metadata keyed by the producing agent. Display only; the runtime
// does not consult it.
export const AGENT_GATE_INFO: Record<string, { gate: number; name: string; outcome: string }> = {
  "po-agent": { gate: 1, name: "Epic approval", outcome: "Jira Epic filed, status Ready for Analysis" },
  "ba-agent": { gate: 2, name: "Story approval", outcome: "Jira Stories filed, status Ready for Architecture" },
};

const DELEGATE_TOOL_PREFIX = "delegate_to_";

// "delegate_to_po" -> "po". Returns null for any tool that is not a delegation.
export function delegatedAgentFromTool(toolName: string | undefined): string | null {
  if (!toolName || !toolName.startsWith(DELEGATE_TOOL_PREFIX)) return null;
  const agent = toolName.slice(DELEGATE_TOOL_PREFIX.length);
  return agent.length > 0 ? canonicalAgentId(agent) : null;
}

export function agentAccess(role: Role, agentId: string): AgentAccess | null {
  return ROLE_AGENT_GRANTS[role][canonicalAgentId(agentId)] ?? null;
}

export function canRunAgent(role: Role, agentId: string): boolean {
  return agentAccess(role, agentId) === "run";
}

export function canReadAgent(role: Role, agentId: string): boolean {
  return agentAccess(role, agentId) !== null;
}

export function assertCanRunAgent(role: Role, agentId: string): void {
  if (!canRunAgent(role, agentId)) {
    throw forbidden(`Role ${role} is not granted to run agent ${agentId}`, { role, agentId });
  }
}

export interface ApprovalScope {
  // The agent whose output is being reviewed, or null for a clarification question.
  producingAgent: string | null;
  requiredRole: Role | null;
  requestedBy: string;
}

// Resolves who must answer a runtime pause. Deterministic: agent -> role table, else requester.
export function resolveApprover(producingAgent: string | null, requestedBy: string): ApprovalScope {
  const canonical = producingAgent ? canonicalAgentId(producingAgent) : null;
  const requiredRole = canonical ? (AGENT_APPROVER_ROLE[canonical] ?? null) : null;
  return { producingAgent: canonical, requiredRole, requestedBy };
}

export function canDecide(user: { id: string; role: Role }, scope: ApprovalScope): boolean {
  if (scope.requiredRole) {
    // Admins manage the registry; they cannot stand in for an approver (FR-REG-3).
    return user.role === scope.requiredRole;
  }
  return user.id === scope.requestedBy;
}

export function assertCanDecide(user: { id: string; role: Role }, scope: ApprovalScope): void {
  if (!canDecide(user, scope)) {
    throw forbidden(
      scope.requiredRole
        ? `This decision requires the ${scope.requiredRole} role`
        : "Only the person who started this run can answer this question",
      { requiredRole: scope.requiredRole },
    );
  }
}

export interface RunScope {
  requestedBy: string;
  currentAgent: string | null;
}

// Who may view a run: its requester, an admin, or the approver role of the agent it is
// currently working with.
export function canViewRun(user: { id: string; role: Role }, run: RunScope): boolean {
  if (user.role === "admin") return true;
  if (run.requestedBy === user.id) return true;
  if (run.currentAgent && AGENT_APPROVER_ROLE[canonicalAgentId(run.currentAgent)] === user.role) return true;
  return false;
}

export function agentsApprovedByRole(role: Role): string[] {
  return Object.entries(AGENT_APPROVER_ROLE)
    .filter(([, approver]) => approver === role)
    .map(([agent]) => agent);
}

export function rolesWithAccess(agentId: string, access: AgentAccess): Role[] {
  return (Object.keys(ROLE_AGENT_GRANTS) as Role[]).filter((role) => agentAccess(role, agentId) === access);
}

export function gateInfoFor(agentId: string | null) {
  return agentId ? (AGENT_GATE_INFO[canonicalAgentId(agentId)] ?? null) : null;
}
