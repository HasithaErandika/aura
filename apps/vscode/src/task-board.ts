// What the Plan and Review views show for the Task in the current conversation, built from the
// runtime's Task events (progress events with source "task", agent-runtime tools/task-tools.ts).
// Pure, so it is tested directly.

export interface PlanStepView {
  title: string;
  detail: string;
  files: string[];
}

export interface CheckView {
  command: string;
  passed: boolean;
  exitCode: number;
}

export interface FindingView {
  severity: "blocker" | "major" | "minor";
  file: string | null;
  message: string;
}

export interface ChangedFileView {
  path: string;
  status: string;
}

export type TaskStatus = "plan-review" | "coding" | "code-review" | "accepted";

export interface TaskBoard {
  taskKey: string;
  status: TaskStatus;
  coder: string;
  route: string;
  plan: { summary: string; steps: PlanStepView[]; checks: string[]; risks: string[] } | null;
  // Live steps of the coder ↔ Evaluator loop, newest last.
  activity: string[];
  round: number;
  maxRounds: number;
  review: { passed: boolean; rounds: number; changedFiles: ChangedFileView[]; checks: CheckView[]; summary: string; findings: FindingView[] } | null;
}

const MAX_ACTIVITY = 60;

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const PHASE_LABEL: Record<string, string> = { coder: "Coder", checks: "Checks", evaluator: "Evaluator" };

export function applyTaskEvent(board: TaskBoard | null, data: Record<string, unknown>): TaskBoard | null {
  const kind = str(data.kind);
  if (kind === "plan") {
    const plan = (data.plan ?? {}) as Record<string, unknown>;
    return {
      taskKey: str(data.taskKey),
      status: "plan-review",
      coder: str(data.coder),
      route: str(data.route),
      plan: {
        summary: str(plan.summary),
        steps: arr<Record<string, unknown>>(plan.steps).map((s) => ({ title: str(s.title), detail: str(s.detail), files: arr<string>(s.files) })),
        checks: arr<string>(plan.checks),
        risks: arr<string>(plan.risks),
      },
      activity: [],
      round: 0,
      maxRounds: 0,
      review: null,
    };
  }
  if (!board) return board;
  switch (kind) {
    case "coding":
      return { ...board, status: "coding", coder: str(data.coder) || board.coder, maxRounds: Number(data.maxRounds) || board.maxRounds, activity: [], review: null };
    case "step": {
      const round = Number(data.round) || board.round;
      const phase = str(data.phase);
      let line: string | null = null;
      if (phase === "coder-tool") line = `  ${str(data.tool).replace(/^mastra_workspace_/, "").replace(/_/g, " ")} ${str(data.detail)}`.trimEnd();
      else if (phase === "round") line = `Round ${round}: ${data.passed ? "passed" : "not passed"}`;
      else if (data.status === "start") line = `${PHASE_LABEL[phase] ?? phase} (round ${round})…`;
      else if (phase === "checks" || phase === "evaluator") line = `${PHASE_LABEL[phase]}: ${data.passed ? "✓" : "✗"} ${str(data.detail)}`.trimEnd();
      return { ...board, round, activity: line ? [...board.activity, line].slice(-MAX_ACTIVITY) : board.activity };
    }
    case "review": {
      const verdict = (data.verdict ?? {}) as Record<string, unknown>;
      return {
        ...board,
        status: "code-review",
        review: {
          passed: data.passed === true,
          rounds: Number(data.rounds) || 0,
          changedFiles: arr<ChangedFileView>(data.changedFiles),
          checks: arr<CheckView>(data.checks),
          summary: str(verdict.summary),
          findings: arr<FindingView>(verdict.findings),
        },
      };
    }
    case "accepted":
      return { ...board, status: "accepted" };
    default:
      return board;
  }
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  "plan-review": "Plan waiting for your approval (Gate 4)",
  coding: "Coders working",
  "code-review": "Code waiting for your review (Gate 5)",
  accepted: "Accepted, ready for a pull request",
};
