import type { Role } from "../identity/roles.js";
import { forbidden } from "../../lib/http/errors.js";

// Authorization data (docs/ARCHITECTURE.md §6): who may run which agent and who answers each gate.

export type AgentAccess = "run" | "read";

// Delegate tool short names ("delegate_to_po" → "po") mapped to runtime agent ids.
export const AGENT_ALIASES: Record<string, string> = {
  po: "po-agent",
  ba: "ba-agent",
  architect: "architect-agent",
  qa: "qa-agent",
  deploy: "deployer-agent",
  planner: "task-planner",
  coder: "coder",
  review: "coder",
  pr: "git-agent",
};

export function canonicalAgentId(agentId: string): string {
  return AGENT_ALIASES[agentId] ?? agentId;
}

// Role → agent → access; anything missing is denied. Admins read everything and run nothing.
export const ROLE_AGENT_GRANTS: Record<Role, Record<string, AgentAccess>> = {
  project_owner: { orchestrator: "run", "po-agent": "run", "ba-agent": "read", "deployer-agent": "read" },
  business_analyst: { orchestrator: "run", "ba-agent": "run", "po-agent": "read", "qa-agent": "read" },
  architect: { orchestrator: "run", "architect-agent": "run", "ba-agent": "read", "qa-agent": "read", "deployer-agent": "read", "vscode-agent": "read" },
  developer: { "vscode-agent": "run", "task-planner": "run", coder: "run", "git-agent": "run", "architect-agent": "read", "qa-agent": "read" },
  qa_engineer: { orchestrator: "run", "qa-agent": "run", "architect-agent": "read", "git-agent": "read" },
  deployer: { orchestrator: "run", "deployer-agent": "run", "qa-agent": "read" },
  admin: {
    orchestrator: "read",
    "po-agent": "read",
    "ba-agent": "read",
    "architect-agent": "read",
    "qa-agent": "read",
    "deployer-agent": "read",
    "vscode-agent": "read",
    "task-planner": "read",
    coder: "read",
    "git-agent": "read",
  },
};

// The role that answers a gate after this agent's draft. VS Code gates go to the run's requester.
export const AGENT_APPROVER_ROLE: Record<string, Role> = {
  "po-agent": "project_owner",
  "ba-agent": "business_analyst",
  "architect-agent": "architect",
  "qa-agent": "qa_engineer",
  "deployer-agent": "deployer",
};

// Gate labels for display; the runtime never reads them.
export const AGENT_GATE_INFO: Record<string, { gate: number | null; name: string; outcome: string }> = {
  "po-agent": { gate: 1, name: "Epic approval", outcome: "Jira Epic filed, status Ready for Analysis" },
  "ba-agent": { gate: 2, name: "Story approval", outcome: "Jira Stories filed, status Ready for Architecture" },
  "architect-agent": { gate: 3, name: "Architecture approval", outcome: "Design documents saved and Jira Tasks filed, status Ready for Development" },
  "qa-agent": { gate: null, name: "Test plan approval", outcome: "Test plan and scenarios saved to the QA page, Epic commented" },
  "deployer-agent": { gate: 8, name: "Release plan approval", outcome: "Release notes, change plan and rollback plan commented on the Epic; a human executes the release" },
  "task-planner": { gate: 4, name: "Task plan approval", outcome: "The coders implement the approved plan in your workspace" },
  coder: { gate: 5, name: "Code review", outcome: "The change is accepted and the Task is ready for a pull request" },
  "git-agent": { gate: 6, name: "Pull request", outcome: "The branch is pushed and a pull request to development is opened" },
};

const DELEGATE_TOOL_PREFIX = "delegate_to_";

// "delegate_to_po" → "po-agent"; null for any tool that is not a delegation.
export function delegatedAgentFromTool(toolName: string | undefined): string | null {
  if (!toolName?.startsWith(DELEGATE_TOOL_PREFIX)) return null;
  const agent = toolName.slice(DELEGATE_TOOL_PREFIX.length);
  return agent ? canonicalAgentId(agent) : null;
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
  if (!canRunAgent(role, agentId)) throw forbidden(`Role ${role} is not granted to run agent ${agentId}`, { role, agentId });
}

// Anyone with an agent grant takes part in the pipeline and may read its artifacts.
function isPipelineRole(role: Role): boolean {
  return role === "admin" || Object.keys(ROLE_AGENT_GRANTS[role]).length > 0;
}

export function canViewDesignDocs(role: Role): boolean {
  return isPipelineRole(role);
}

// The role that runs the agent producing a document kind may edit it.
export function canEditDesignDoc(role: Role, owningAgent: "architect-agent" | "qa-agent"): boolean {
  return canRunAgent(role, owningAgent);
}

export function canViewJira(role: Role): boolean {
  return isPipelineRole(role);
}

// Task pull requests and CI: everyone who reads the QA plan.
export function canViewTaskPrs(role: Role): boolean {
  return canReadAgent(role, "qa-agent");
}

export interface ApprovalScope {
  producingAgent: string | null;
  requiredRole: Role | null;
  requestedBy: string;
}

// Who must answer a runtime pause: the agent's approver role, else the run's requester.
export function resolveApprover(producingAgent: string | null, requestedBy: string): ApprovalScope {
  const canonical = producingAgent ? canonicalAgentId(producingAgent) : null;
  return { producingAgent: canonical, requiredRole: canonical ? (AGENT_APPROVER_ROLE[canonical] ?? null) : null, requestedBy };
}

// Admins never stand in for an approver.
export function canDecide(user: { id: string; role: Role }, scope: ApprovalScope): boolean {
  return scope.requiredRole ? user.role === scope.requiredRole : user.id === scope.requestedBy;
}

export function assertCanDecide(user: { id: string; role: Role }, scope: ApprovalScope): void {
  if (canDecide(user, scope)) return;
  const message = scope.requiredRole ? `This decision requires the ${scope.requiredRole} role` : "Only the person who started this run can answer this question";
  throw forbidden(message, { requiredRole: scope.requiredRole });
}

export interface RunScope {
  requestedBy: string;
  currentAgent: string | null;
}

// A run is visible to its requester, admins and the approver role of its current agent.
export function canViewRun(user: { id: string; role: Role }, run: RunScope): boolean {
  if (user.role === "admin" || run.requestedBy === user.id) return true;
  return Boolean(run.currentAgent && AGENT_APPROVER_ROLE[canonicalAgentId(run.currentAgent)] === user.role);
}

export function canStopRun(user: { id: string; role: Role }, run: { requestedBy: string }): boolean {
  return user.role === "admin" || run.requestedBy === user.id;
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

const GATE_DECISION_PATTERN = /approve|reject|revise/i;

// A pause offering Approve/Revise/Reject is a gate; anything else is a plain question.
export function isGateDecision(options: { label: string; value?: string }[] | null | undefined): boolean {
  return Boolean(options?.some((o) => GATE_DECISION_PATTERN.test(o.label) || (o.value ? GATE_DECISION_PATTERN.test(o.value) : false)));
}

export function gateInfoForPause(producingAgent: string | null, options: { label: string; value?: string }[] | null | undefined) {
  return isGateDecision(options) ? gateInfoFor(producingAgent) : null;
}
