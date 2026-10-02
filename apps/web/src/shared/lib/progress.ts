export const WORKFLOW_STEP_NAMES: Record<string, string> = {
  "requirements-analysis": "Requirements analysis",
  "system-decomposition": "System decomposition",
  "frontend-design": "Frontend design",
  "api-design": "API design",
  "integration-design": "Integration design",
  "data-design": "Data design",
  "security-design": "Security design",
  "ai-design": "AI design",
  "deployment-testing": "Deployment and testing notes",
  assemble: "ADRs and tasks",
  "coverage-and-scenarios": "Coverage and scenarios",
  "write-tests": "Test plan",
};

export function workflowStepTitle(stepId: string, phase: string | undefined): string {
  const name = WORKFLOW_STEP_NAMES[stepId] ?? stepId;
  return `${name}${phase === "start" ? "..." : " done"}`;
}

export interface TaskProgress {
  kind?: string;
  phase?: string;
  step?: string;
  tool?: string;
  taskKey?: string;
  passed?: boolean;
  round?: number;
}

export function taskProgressTitle(p: TaskProgress): string {
  const task = p.taskKey ? ` for ${p.taskKey}` : "";
  switch (p.kind) {
    case "plan":
      return `Task plan drafted${task} (Gate 4)`;
    case "coding":
      return `Coders started${task}`;
    case "step":
      return p.tool ? `Coder used ${p.tool}` : `Coder step${p.round ? ` (round ${p.round})` : ""}`;
    case "part":
      return "Parallel subtask update";
    case "review":
      return `Code ready for review${task} (Gate 5)${p.passed === false ? ", checks failing" : ""}`;
    case "accepted":
      return `Change accepted${task}`;
    case "pr-draft":
      return `Pull request drafted${task} (Gate 6)`;
    case "pr-step":
      return `Pull request: ${p.step ?? "working"}`;
    case "pr":
      return `Pull request opened${task}`;
    default:
      return "VS Code task update";
  }
}
