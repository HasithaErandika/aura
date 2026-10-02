import { forbidden } from "../../lib/http/errors.js";
import type { Role } from "../../lib/auth/roles.js";

export type AgentAccess = "run" | "read";

type Actor = { id: string; role: Role };

const AGENT_ALIASES: Record<string, string> = {
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
const ROLE_AGENT_GRANTS: Record<Role, Record<string, AgentAccess>> = {
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

// VS Code gates have no approver role: the run's requester answers them.
export const AGENT_APPROVER_ROLE: Record<string, Role> = {
  "po-agent": "project_owner",
  "ba-agent": "business_analyst",
  "architect-agent": "architect",
  "qa-agent": "qa_engineer",
  "deployer-agent": "deployer",
};

export interface GateInfo {
  gate: number | null;
  name: string;
  outcome: string;
}

const AGENT_GATE_INFO: Record<string, GateInfo> = {
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
const GATE_DECISION_PATTERN = /approve|reject|revise/i;

export function delegatedAgentFromTool(toolName: string | undefined): string | null {
  if (!toolName?.startsWith(DELEGATE_TOOL_PREFIX)) return null;
  const agent = toolName.slice(DELEGATE_TOOL_PREFIX.length);
  return agent ? canonicalAgentId(agent) : null;
}

export function agentGrants(role: Role): Record<string, AgentAccess> {
  return ROLE_AGENT_GRANTS[role];
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

export function assertCanReadAgent(role: Role, agentId: string): void {
  if (!canReadAgent(role, agentId)) throw forbidden("Your role cannot access this agent", { role, agentId });
}

function isPipelineRole(role: Role): boolean {
  return role === "admin" || Object.keys(ROLE_AGENT_GRANTS[role]).length > 0;
}

export function canViewDesignDocs(role: Role): boolean {
  return isPipelineRole(role);
}

export function canEditDesignDoc(role: Role, owningAgent: "architect-agent" | "qa-agent"): boolean {
  return canRunAgent(role, owningAgent);
}

export function canViewJira(role: Role): boolean {
  return isPipelineRole(role);
}

export function canViewTaskPrs(role: Role): boolean {
  return canReadAgent(role, "qa-agent");
}

export interface ApprovalScope {
  producingAgent: string | null;
  requiredRole: Role | null;
  requestedBy: string;
}

export function resolveApprover(producingAgent: string | null, requestedBy: string): ApprovalScope {
  const canonical = producingAgent ? canonicalAgentId(producingAgent) : null;
  return { producingAgent: canonical, requiredRole: canonical ? (AGENT_APPROVER_ROLE[canonical] ?? null) : null, requestedBy };
}

// Admins never stand in for an approver.
export function canDecide(user: Actor, scope: ApprovalScope): boolean {
  return scope.requiredRole ? user.role === scope.requiredRole : user.id === scope.requestedBy;
}

export function assertCanDecide(user: Actor, scope: ApprovalScope): void {
  if (canDecide(user, scope)) return;
  const message = scope.requiredRole ? `This decision requires the ${scope.requiredRole} role` : "Only the person who started this run can answer this question";
  throw forbidden(message, { requiredRole: scope.requiredRole });
}

export function canViewApproval(user: Actor, scope: ApprovalScope): boolean {
  return user.role === "admin" || scope.requestedBy === user.id || canDecide(user, scope);
}

export interface RunScope {
  requestedBy: string;
  currentAgent: string | null;
}

export function canViewRun(user: Actor, run: RunScope): boolean {
  if (user.role === "admin" || run.requestedBy === user.id) return true;
  return Boolean(run.currentAgent && AGENT_APPROVER_ROLE[canonicalAgentId(run.currentAgent)] === user.role);
}

export function canStopRun(user: Actor, run: { requestedBy: string }): boolean {
  return user.role === "admin" || run.requestedBy === user.id;
}

export function canNoteRun(user: Actor, run: { requestedBy: string }): boolean {
  return run.requestedBy === user.id;
}

// Project access (roadmap step 4.1): admins use every project, others the projects they are
// members of. Before any project is registered (null) nothing is project-scoped yet.
export function canUseProject(user: Actor, projectId: string | null, memberOf: ReadonlySet<string>): boolean {
  return projectId === null || user.role === "admin" || memberOf.has(projectId);
}

export function canChangeSharedSettings(role: Role): boolean {
  return role === "admin";
}

export function agentsApprovedByRole(role: Role): string[] {
  return Object.entries(AGENT_APPROVER_ROLE)
    .filter(([, approver]) => approver === role)
    .map(([agent]) => agent);
}

export function rolesWithAccess(agentId: string, access: AgentAccess): Role[] {
  return (Object.keys(ROLE_AGENT_GRANTS) as Role[]).filter((role) => agentAccess(role, agentId) === access);
}

export function gateInfoFor(agentId: string | null): GateInfo | null {
  return agentId ? (AGENT_GATE_INFO[canonicalAgentId(agentId)] ?? null) : null;
}

// A pause offering Approve/Revise/Reject is a gate; anything else is a plain question.
export function gateInfoForPause(producingAgent: string | null, options: { label: string; value?: string }[] | null | undefined): GateInfo | null {
  const isGate = Boolean(options?.some((o) => GATE_DECISION_PATTERN.test(o.label) || (o.value ? GATE_DECISION_PATTERN.test(o.value) : false)));
  return isGate ? gateInfoFor(producingAgent) : null;
}
