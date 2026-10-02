import type { ComponentType, SVGProps } from "react";
import {
  AuditIcon,
  ClipboardCheckIcon,
  CloudIcon,
  CodeIcon,
  DocumentIcon,
  GateIcon,
  GitIcon,
  InfinityIcon,
  PersonIcon,
  SwapIcon,
  TicketIcon,
  UsersIcon,
} from "@/shared/icons/index.tsx";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export const PRINCIPLES = [
  { num: "01", title: "Agents propose; code decides", description: "Authorization, risk tiers, approvals and audit live in code. None of it is delegated to a prompt." },
  { num: "02", title: "Jira is the system of record", description: "Agents read and write Jira. AURA never becomes a second project-management tool." },
  { num: "03", title: "Humans approve every step", description: "Each agent draft waits in SUSPENDED_FOR_APPROVAL until a person with the right role decides." },
  { num: "04", title: "Bounded, checked tools", description: "Every tool call passes the gateway: it needs a recorded human decision and a risk tier." },
  { num: "05", title: "Evidence over assertion", description: "CI reports test results on the pull request. Agents never claim a pass they did not see." },
];

export const GOVERNANCE: Array<{ icon: Icon; title: string; description: string }> = [
  { icon: GateIcon, title: "Human in the loop", description: "Every consequential action pauses for an approval recorded outside the model." },
  { icon: AuditIcon, title: "Complete audit trail", description: "Runs, decisions and changes are logged append-only, with a hash of what was approved." },
  { icon: UsersIcon, title: "Role-based access", description: "Each agent and action is granted by role, evaluated in the API, never by an agent." },
  { icon: TicketIcon, title: "Jira stays the source of truth", description: "Approved drafts are filed in Jira, so the team keeps working where it already works." },
];

export const ROLES: Array<{ label: string; icon: Icon; gate: string; scope: string }> = [
  { label: "Project Owner", icon: PersonIcon, gate: "Gate 1", scope: "Epic definition and scope" },
  { label: "Business Analyst", icon: DocumentIcon, gate: "Gate 2", scope: "User Stories and acceptance criteria" },
  { label: "Architect", icon: SwapIcon, gate: "Gate 3", scope: "Architecture, ADRs and Tasks" },
  { label: "QA Engineer", icon: ClipboardCheckIcon, gate: "Test plan", scope: "Test plan, scenarios and CI results" },
  { label: "Developer", icon: CodeIcon, gate: "Gates 4-6", scope: "Task plan, code review and pull request in VS Code" },
  { label: "Deployer", icon: CloudIcon, gate: "Gate 8", scope: "Release notes, change and rollback plan" },
];

export const INTEGRATIONS: Array<{ label: string; icon: Icon }> = [
  { label: "Jira", icon: TicketIcon },
  { label: "GitHub", icon: GitIcon },
  { label: "CI pipelines", icon: InfinityIcon },
  { label: "VS Code", icon: CodeIcon },
];

export const STAGE_DETAILS: Record<string, { objective: string; outputs: string[]; approver: string }> = {
  epic: { objective: "Drafts the Epic: objective, scope and success measures.", outputs: ["Epic", "Scope", "Success metrics"], approver: "Project Owner" },
  stories: { objective: "Breaks the Epic into User Stories with acceptance criteria.", outputs: ["User Stories", "Acceptance criteria"], approver: "Business Analyst" },
  architecture: { objective: "Designs the system and splits the work into Jira Tasks.", outputs: ["Architecture plan", "ADRs", "Jira Tasks"], approver: "Architect" },
  "test-plan": { objective: "Writes the test plan and scenarios for the Epic.", outputs: ["Test plan", "Test scenarios"], approver: "QA Engineer" },
  "task-plan": { objective: "Plans one Task in the developer's workspace before any code changes.", outputs: ["Task plan", "Branch"], approver: "Developer" },
  "code-review": { objective: "Coders implement the plan; the Evaluator checks each round.", outputs: ["Code change", "Check results"], approver: "Developer" },
  "pull-request": { objective: "Commits, pushes and opens the pull request. CI reports back.", outputs: ["Pull request", "CI result"], approver: "Developer" },
  release: { objective: "Prepares release notes, the change plan and the rollback plan.", outputs: ["Release notes", "Rollback plan"], approver: "Deployer" },
};

export const ARCH_LAYERS = [
  { title: "Users and roles", desc: "Project Owners, BAs, Architects, Developers, QA Engineers, Deployers, Admins", tag: "Supabase Auth" },
  { title: "apps/web", desc: "Agent Workspace, Approval Inbox, Runs, Design documents, QA, Jira, Audit", tag: "Web app" },
  { title: "apps/vscode", desc: "AURA for VS Code: Task plan, code review and pull request (Gates 4-6)", tag: "VS Code extension" },
  { title: "apps/api", desc: "Auth, policy, approvals, audit, Jira, design documents, CI reports", tag: "Deterministic control" },
  { title: "apps/agent-runtime", desc: "Mastra agents, workflows and the tool gateway with risk tiers", tag: "Agent runtime" },
  { title: "Integrations", desc: "Jira, GitHub pull requests and CI", tag: "Systems of record" },
];

export const AUTH_STEPS = [
  { title: "A signed-in user starts a run", text: "The API loads the user's role and the agents that role may run or read." },
  { title: "Policy decides, not the model", text: "The API checks the grant for this role and agent before any turn starts." },
  { title: "Drafts pause for a person", text: "The run moves to SUSPENDED_FOR_APPROVAL and the draft snapshot is hashed." },
  { title: "The decision unlocks one step", text: "The approver decides on that exact snapshot; the gateway lets one approved step run." },
];
