export type AgentSurface = "web" | "vscode";

export interface AgentInfo {
  id: string;
  label: string;
  surface: AgentSurface;
}

export const AGENTS: readonly AgentInfo[] = [
  { id: "orchestrator", label: "Orchestrator", surface: "web" },
  { id: "po-agent", label: "PO Agent", surface: "web" },
  { id: "ba-agent", label: "BA Agent", surface: "web" },
  { id: "architect-agent", label: "Architect Agent", surface: "web" },
  { id: "qa-agent", label: "QA Agent", surface: "web" },
  { id: "deployer-agent", label: "Deployer Agent", surface: "web" },
  { id: "vscode-agent", label: "VS Code Agent", surface: "vscode" },
  { id: "task-planner", label: "Task Planner", surface: "vscode" },
  { id: "coder", label: "Coder", surface: "vscode" },
  { id: "evaluator", label: "Evaluator", surface: "vscode" },
  { id: "git-agent", label: "Git Agent", surface: "vscode" },
];

const BY_ID = new Map(AGENTS.map((a) => [a.id, a]));

export function canonicalAgentId(id: string): string {
  return id.startsWith("coder-") ? "coder" : id;
}

export function agentLabel(id: string | null | undefined): string {
  if (!id) return "Orchestrator";
  if (id.startsWith("eval:")) return `Eval: ${agentLabel(id.slice(5))}`;
  const known = BY_ID.get(id);
  if (known) return known.label;
  if (id.startsWith("coder-")) return `Coder (${id.slice(6)})`;
  return id;
}

export function agentSurface(id: string): AgentSurface {
  return BY_ID.get(canonicalAgentId(id))?.surface ?? "web";
}
