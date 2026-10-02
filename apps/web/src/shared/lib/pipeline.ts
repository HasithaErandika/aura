import type { AgentSurface } from "./agents.ts";

export interface PipelineStage {
  key: string;
  gate: number | null;
  name: string;
  short: string;
  agentId: string;
  agentLabel: string;
  surface: AgentSurface;
  scope: "epic" | "task";
}

export const PIPELINE: readonly PipelineStage[] = [
  { key: "epic", gate: 1, name: "Epic approval", short: "Epic", agentId: "po-agent", agentLabel: "PO Agent", surface: "web", scope: "epic" },
  { key: "stories", gate: 2, name: "Story approval", short: "Stories", agentId: "ba-agent", agentLabel: "BA Agent", surface: "web", scope: "epic" },
  { key: "architecture", gate: 3, name: "Architecture approval", short: "Architecture", agentId: "architect-agent", agentLabel: "Architect Agent", surface: "web", scope: "epic" },
  { key: "test-plan", gate: null, name: "Test plan approval", short: "Test plan", agentId: "qa-agent", agentLabel: "QA Agent", surface: "web", scope: "epic" },
  { key: "task-plan", gate: 4, name: "Task plan approval", short: "Task plan", agentId: "task-planner", agentLabel: "Task Planner", surface: "vscode", scope: "task" },
  { key: "code-review", gate: 5, name: "Code review", short: "Code review", agentId: "coder", agentLabel: "Coder", surface: "vscode", scope: "task" },
  { key: "pull-request", gate: 6, name: "Pull request", short: "Pull request", agentId: "git-agent", agentLabel: "Git Agent", surface: "vscode", scope: "task" },
  { key: "release", gate: 8, name: "Release plan approval", short: "Release plan", agentId: "deployer-agent", agentLabel: "Deployer Agent", surface: "web", scope: "epic" },
];

export function gateNumberLabel(gate: number | null | undefined, fallback = "Test plan"): string {
  return typeof gate === "number" ? `Gate ${gate}` : fallback;
}

export function gateTitle(gate: { number: number | null; name: string } | null | undefined, fallback = "Question from the Orchestrator"): string {
  if (!gate) return fallback;
  return typeof gate.number === "number" ? `Gate ${gate.number}: ${gate.name}` : gate.name;
}

export function stagesFor(issueType: string): PipelineStage[] {
  const type = issueType.toLowerCase();
  if (type === "epic") return [...PIPELINE];
  if (type === "task" || type === "sub-task" || type === "subtask") return PIPELINE.filter((s) => s.scope === "task");
  return [];
}
