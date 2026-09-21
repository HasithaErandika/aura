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
  architect: "architect-agent",
  dev: "dev-agent",
  code: "coding-agent",
  qa: "qa-agent",
  test: "tester-agent",
  deploy: "deployer-agent",
  git: "git-tool",
};

export function canonicalAgentId(agentId: string): string {
  return AGENT_ALIASES[agentId] ?? agentId;
}

// Role -> agent -> access. Any agent the runtime exposes that is missing from a role's row is
// denied for that role (default deny). Admins can read everything and run nothing.
export const ROLE_AGENT_GRANTS: Record<Role, Record<string, AgentAccess>> = {
  project_owner: { orchestrator: "run", "po-agent": "run", "ba-agent": "read", "deployer-agent": "read" },
  business_analyst: { orchestrator: "run", "ba-agent": "run", "po-agent": "read", "qa-agent": "read" },
  admin: {
    orchestrator: "read",
    "po-agent": "read",
    "ba-agent": "read",
    "architect-agent": "read",
    "dev-agent": "read",
    "coding-agent": "read",
    "qa-agent": "read",
    "tester-agent": "read",
    "deployer-agent": "read",
    "git-tool": "read",
  },
  // "Architect (read)" on Dev/Coding/QA/Tester/Deployer output matches the RACI table in
  // docs/ARCHITECTURE.md section 4.2 (Architect has oversight, not ownership, past Gate 3).
  architect: {
    orchestrator: "run",
    "architect-agent": "run",
    "ba-agent": "read",
    "dev-agent": "read",
    "coding-agent": "read",
    "qa-agent": "read",
    "tester-agent": "read",
    "deployer-agent": "read",
  },
  developer: { orchestrator: "run", "dev-agent": "run", "coding-agent": "run", "git-tool": "run", "architect-agent": "read" },
  // "QA Engineer | QA, Tester, Dev (read) | Approves test plans; verifies results" - QA Engineer
  // can run both QA and Tester agents and is the sole approver of both their gates (6 and 7),
  // matching the RACI row exactly rather than splitting approval across two roles.
  qa_engineer: { orchestrator: "run", "qa-agent": "run", "tester-agent": "run", "dev-agent": "read" },
  // "Tester | Tester | Executes/curates suites" - can run the Tester agent, but does not approve
  // its gate (that stays qa_engineer, per AGENT_APPROVER_ROLE below).
  tester: { orchestrator: "run", "tester-agent": "run", "qa-agent": "read" },
  // "Deployer | Deployer, QA (read) | Approves releases" (four-eyes is enforced at the release
  // execution step itself, outside this table - see docs/ARCHITECTURE.md section 4.2).
  deployer: { orchestrator: "run", "deployer-agent": "run", "qa-agent": "read" },
};

// Which human role signs off on an agent's output when the Orchestrator pauses after
// delegating to it (section 4.2 "Approves" column, section 5.1 gates). A question raised
// before any delegation, or after delegating to an agent not listed here, goes back to the
// person who started the run.
export const AGENT_APPROVER_ROLE: Record<string, Role> = {
  "po-agent": "project_owner",
  "ba-agent": "business_analyst",
  "architect-agent": "architect",
  "dev-agent": "developer",
  "coding-agent": "developer",
  // Both test-related gates are approved by QA Engineer ("Approves test plans; verifies
  // results" - docs/ARCHITECTURE.md section 4.2), even though the Tester role can also run
  // tester-agent (ROLE_AGENT_GRANTS above).
  "qa-agent": "qa_engineer",
  "tester-agent": "qa_engineer",
  "deployer-agent": "deployer",
  "git-tool": "developer",
};

// Human-readable gate metadata keyed by the producing agent. Display only; the runtime
// does not consult it.
export const AGENT_GATE_INFO: Record<string, { gate: number; name: string; outcome: string }> = {
  "po-agent": { gate: 1, name: "Epic approval", outcome: "Jira Epic filed, status Ready for Analysis" },
  "ba-agent": { gate: 2, name: "Story approval", outcome: "Jira Stories filed, status Ready for Architecture" },
  "architect-agent": { gate: 3, name: "Architecture approval", outcome: "Jira Tasks filed, status Ready for Development" },
  "dev-agent": { gate: 4, name: "Dev scaffold approval", outcome: "Scaffold executed in a sandboxed container, Task commented with the result" },
  "coding-agent": { gate: 5, name: "Coding agent approval", outcome: "Coding CLI ran in the sandbox, Task commented and moved toward In Review" },
  "qa-agent": { gate: 6, name: "QA test plan approval", outcome: "Test plan and Playwright source filed to the QA workspace, Epic commented" },
  "tester-agent": { gate: 7, name: "Test result verification", outcome: "Real Playwright suite executed in a sandbox, Task commented with the real result and AI interpretation" },
  "deployer-agent": { gate: 8, name: "Release plan approval", outcome: "Release notes, change plan, and rollback plan commented on the Epic - a human executes the release" },
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

// Who may view the artifacts of the Epic/Story/Task pipeline - the Architect's per-Epic
// workspace files (docs/ARCHITECTURE.md section 6.3) and Jira itself (modules/jira). There is
// no projects/jira_project_links table yet (section 9.1) to scope this by project membership,
// so it is scoped by "is this person part of the pipeline at all": anyone with at least one
// agent grant (PO, BA, Architect), plus admins. PO and BA only ever get a "read" grant on
// architect-agent (they cannot run it), but that is enough to also read what it produced - the
// same read/run split every other agent grant already uses.
function canViewEpicArtifacts(role: Role): boolean {
  return role === "admin" || Object.keys(ROLE_AGENT_GRANTS[role]).length > 0;
}

export function canViewArchitectWorkspace(role: Role): boolean {
  return canViewEpicArtifacts(role);
}

// Who may hand-edit an Architect workspace document. Narrower than viewing it: only the human
// architect (the one role with a "run" grant on architect-agent, i.e. the one actually
// producing this design) - not admins (they never author/decide, per canDecide's own rule) and
// not PO/BA (they can read the design but do not own it).
export function canEditArchitectWorkspace(role: Role): boolean {
  return canRunAgent(role, "architect-agent");
}

// Read-only browsing of Jira Epics/Stories/Tasks, fetched directly from Jira - see modules/jira.
export function canViewJira(role: Role): boolean {
  return canViewEpicArtifacts(role);
}

// Who may view a Task's scaffolded directory (Gate 4/5 output) and the Docker run visibility
// panel - the same audience as dev-agent itself: developer (runs it), architect (read, RACI
// oversight), admin (read-all).
export function canViewDevWorkspace(role: Role): boolean {
  return canReadAgent(role, "dev-agent");
}

// Who may view the QA workspace (Gate 6's test plan + Playwright source) and test-run history
// (Gate 7's real results) - the same audience as qa-agent itself: qa_engineer and tester (both
// have a grant on it - ROLE_AGENT_GRANTS above), architect (read, RACI oversight), admin.
export function canViewQaWorkspace(role: Role): boolean {
  return canReadAgent(role, "qa-agent");
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

const GATE_DECISION_PATTERN = /approve|reject|revise/i;

// An ask_user pause offering Approve/Reject/Revise is a gate decision reviewing a specific
// agent's output; anything else (e.g. a plain "Continue to the next stage?" Continue/Stop
// prompt) is a continuation question with no agent output to review, and must not be labeled
// with the previous gate's name (docs/ARCHITECTURE.md section 5.1). Mastra's built-in ask_user
// tool has a fixed {question, options, selectionMode} payload with no room for a custom "kind"
// field, so this is content-based - the same signal buildResumeData() already relies on in
// approvals.service.ts.
export function isGateDecision(options: { label: string; value?: string }[] | null | undefined): boolean {
  return Boolean(options?.some((o) => GATE_DECISION_PATTERN.test(o.label) || (o.value ? GATE_DECISION_PATTERN.test(o.value) : false)));
}

// Only a real gate decision gets gate metadata; a continuation prompt never does, even when
// producingAgent still points at the last delegated agent.
export function gateInfoForPause(producingAgent: string | null, options: { label: string; value?: string }[] | null | undefined) {
  return isGateDecision(options) ? gateInfoFor(producingAgent) : null;
}
