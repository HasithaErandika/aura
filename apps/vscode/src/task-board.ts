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

// A parallel part (V5): its own coder, sub-branch and worktree, merged into the Task branch.
export interface PartView {
  n: number;
  title: string;
  coder: string;
  branch: string;
  scope: string[];
  status: string;
  rounds: number;
  passed: boolean | null;
  merge: string | null;
}

// The Task's pull request (V6): the Gate 6 draft, then the opened PR and its CI.
export interface PrView {
  draftId: string | null;
  title: string;
  branch: string;
  base: string;
  reviewers: string[];
  step: string | null;
  url: string | null;
  number: number | null;
  // open, merged (a person merged it on GitHub) or closed; from AURA through the GitHub webhook.
  prState: string | null;
  ciState: string | null;
  ciUrl: string | null;
  // The AURA QA check (step 3.7): pending, success or failure, and what is missing.
  qaState: string | null;
  qaDetail: string;
  jobs: { name: string; result: string }[];
  tests: { passed: number; failed: number; skipped: number } | null;
}

export type TaskStatus = "plan-review" | "coding" | "code-review" | "accepted" | "pr-review" | "pr-open";

export interface TaskBoard {
  taskKey: string;
  status: TaskStatus;
  coder: string;
  route: string;
  branch: string;
  parts: PartView[];
  plan: { summary: string; steps: PlanStepView[]; checks: string[]; risks: string[] } | null;
  // Live steps of the coder ↔ Evaluator loop, newest last.
  activity: string[];
  round: number;
  maxRounds: number;
  review: { passed: boolean; rounds: number; changedFiles: ChangedFileView[]; checks: CheckView[]; summary: string; findings: FindingView[]; baseRef: string } | null;
  pr: PrView | null;
}

const EMPTY_PR: PrView = { draftId: null, title: "", branch: "", base: "development", reviewers: [], step: null, url: null, number: null, prState: null, ciState: null, ciUrl: null, qaState: null, qaDetail: "", jobs: [], tests: null };

function parts(v: unknown): PartView[] {
  return arr<Record<string, unknown>>(v).map((p) => ({
    n: Number(p.n) || 0,
    title: str(p.title),
    coder: str(p.coder),
    branch: str(p.branch),
    scope: arr<string>(p.scope),
    status: "planned",
    rounds: 0,
    passed: null,
    merge: null,
  }));
}

function updatePart(list: PartView[], n: number, change: Partial<PartView>): PartView[] {
  return list.map((p) => (p.n === n ? { ...p, ...change } : p));
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
      branch: str(data.branch),
      parts: parts(data.subtasks),
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
      pr: null,
    };
  }
  if (!board) return board;
  switch (kind) {
    case "coding":
      return {
        ...board,
        status: "coding",
        coder: str(data.coder) || board.coder,
        branch: str(data.branch) || board.branch,
        // A Gate 5 revise runs without parts: the earlier parts stay as they ended.
        parts: arr(data.subtasks).length ? board.parts.map((p) => ({ ...p, status: "waiting", rounds: 0, passed: null, merge: null })) : board.parts,
        maxRounds: Number(data.maxRounds) || board.maxRounds,
        activity: [],
        review: null,
      };
    case "part": {
      const n = Number(data.subtask) || 0;
      const status = str(data.status);
      let next = board.parts;
      let line: string;
      if (data.stage === "subtask") {
        next = n ? updatePart(next, n, { status, ...(typeof data.passed === "boolean" ? { passed: data.passed } : {}) }) : next;
        line = `Part ${n}: ${status}${data.detail ? ` (${str(data.detail)})` : ""}`;
      } else if (n) {
        next = updatePart(next, n, { merge: status });
        line = `Merge part ${n}: ${status}${data.detail ? ` ${str(data.detail)}` : ""}`;
      } else {
        line = status === "checks" ? "Checks on the merged Task branch…" : `Merged result: ${data.passed ? "✓" : "✗"} ${str(data.detail)}`.trimEnd();
      }
      return { ...board, parts: next, activity: [...board.activity, line].slice(-MAX_ACTIVITY) };
    }
    case "step": {
      const round = Number(data.round) || board.round;
      const phase = str(data.phase);
      const n = Number(data.subtask) || 0;
      const prefix = n ? `[${n}] ` : "";
      let line: string | null = null;
      if (phase === "coder-tool") line = `  ${str(data.tool).replace(/^mastra_workspace_/, "").replace(/_/g, " ")} ${str(data.detail)}`.trimEnd();
      else if (phase === "round") line = `Round ${round}: ${data.passed ? "passed" : "not passed"}`;
      else if (data.status === "start") line = `${PHASE_LABEL[phase] ?? phase} (round ${round})…`;
      else if (phase === "checks" || phase === "evaluator") line = `${PHASE_LABEL[phase]}: ${data.passed ? "✓" : "✗"} ${str(data.detail)}`.trimEnd();
      const partsNow = n && phase === "round" ? updatePart(board.parts, n, { rounds: round }) : n && data.status === "start" ? updatePart(board.parts, n, { status: PHASE_LABEL[phase] ? `${PHASE_LABEL[phase]!.toLowerCase()} (round ${round})` : board.parts.find((p) => p.n === n)?.status ?? "" }) : board.parts;
      return { ...board, round, parts: partsNow, activity: line ? [...board.activity, `${prefix}${line}`].slice(-MAX_ACTIVITY) : board.activity };
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
          baseRef: str(data.baseRef) || "HEAD",
        },
        branch: str(data.branch) || board.branch,
        parts: arr<Record<string, unknown>>(data.subtasks).length
          ? board.parts.map((p) => {
              const r = arr<Record<string, unknown>>(data.subtasks).find((x) => Number(x.n) === p.n);
              return r ? { ...p, rounds: Number(r.rounds) || p.rounds, passed: r.passed === true, merge: str(r.merge) || p.merge } : p;
            })
          : board.parts,
      };
    }
    case "accepted":
      return { ...board, status: "accepted" };
    case "pr-draft":
      return {
        ...board,
        status: "pr-review",
        pr: { ...EMPTY_PR, draftId: str(data.draftId) || null, title: str(data.title), branch: str(data.branch) || board.branch, base: str(data.base) || "development", reviewers: arr<string>(data.reviewers) },
      };
    case "pr-step":
      return { ...board, pr: { ...(board.pr ?? EMPTY_PR), step: str(data.step) || null } };
    case "pr": {
      const summary = (data.ciSummary ?? {}) as Record<string, unknown>;
      const prev = board.pr ?? EMPTY_PR;
      const tests = summary.tests as PrView["tests"] | undefined;
      return {
        ...board,
        status: "pr-open",
        pr: {
          ...prev,
          step: null,
          url: str(data.url) || prev.url,
          number: typeof data.number === "number" ? data.number : prev.number,
          branch: str(data.branch) || prev.branch || board.branch,
          base: str(data.base) || prev.base,
          reviewers: Array.isArray(data.reviewers) ? arr<string>(data.reviewers) : prev.reviewers,
          prState: "prState" in data ? (str(data.prState) || null) : prev.prState,
          qaState: "qaState" in data ? (str(data.qaState) || null) : prev.qaState,
          qaDetail: "qaDetail" in data ? str(data.qaDetail) : prev.qaDetail,
          ciState: "ciState" in data ? (str(data.ciState) || null) : prev.ciState,
          ciUrl: str(data.ciUrl) || prev.ciUrl,
          jobs: Array.isArray(summary.jobs) ? arr<{ name: string; result: string }>(summary.jobs) : prev.jobs,
          tests: tests && typeof tests.passed === "number" ? tests : prev.tests,
        },
      };
    }
    default:
      return board;
  }
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  "plan-review": "Plan waiting for your approval (Gate 4)",
  coding: "Coders working",
  "code-review": "Code waiting for your review (Gate 5)",
  accepted: "Accepted, ready for a pull request",
  "pr-review": "Pull request waiting for your approval (Gate 6)",
  "pr-open": "Pull request open",
};

// A PR from AURA's API (GET /task-prs) as a Task event, so the PR view refreshes its CI status.
export function prEventFrom(pr: { prUrl: string | null; prNumber: number | null; prState?: string | null; qaState?: string | null; qaSummary?: { required: string[]; passed: string[]; failed: string[]; missing: string[] } | null; branch: string; reviewers: string[]; ciState: string | null; ciUrl: string | null; ciSummary: unknown }): Record<string, unknown> {
  return { kind: "pr", url: pr.prUrl, number: pr.prNumber, prState: pr.prState ?? null, qaState: pr.qaState ?? null, qaDetail: qaDetailOf(pr.qaSummary ?? null), branch: pr.branch, reviewers: pr.reviewers, ciState: pr.ciState, ciUrl: pr.ciUrl, ciSummary: pr.ciSummary };
}

function qaDetailOf(q: { required: string[]; passed: string[]; failed: string[]; missing: string[] } | null): string {
  if (!q) return "";
  if (!q.required.length) return "no scenarios linked";
  return [`${q.passed.length}/${q.required.length} scenarios`, q.failed.length ? `failed: ${q.failed.join(", ")}` : "", q.missing.length ? `not tested: ${q.missing.join(", ")}` : ""].filter(Boolean).join(" · ");
}
