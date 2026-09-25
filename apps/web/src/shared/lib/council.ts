// Formats one Coding Council turn (apps/agent-runtime workflows/coding-council.ts, relayed by
// apps/api as SSE event "council" and persisted as a run step with source "council") as plain
// text, for the live chat log and the Run Console timeline.

export interface CouncilTurnEvent {
  draftId: string;
  round: number;
  phase: "plan" | "plan-review" | "build" | "checks" | "review" | "fix" | "done";
  role: "planner" | "implementer" | "reviewer" | "system";
  model?: string;
  status: "started" | "done" | "waiting" | "error";
  text?: string;
  verdict?: "APPROVE" | "CHANGES";
  issues?: { file: string; line?: number; severity: string; problem: string; fix: string }[];
  checks?: { id: string; ok: boolean; output: string }[];
  usage?: { totalTokens: number; budget: number };
}

export const COUNCIL_ROLE_NAMES: Record<CouncilTurnEvent["role"], string> = {
  planner: "Planner",
  implementer: "Implementer",
  reviewer: "Reviewer",
  system: "AURA",
};

export function councilTurnTitle(turn: CouncilTurnEvent): string {
  const verdict = turn.verdict ? (turn.verdict === "APPROVE" ? " - approved" : " - changes requested") : "";
  const state = turn.status === "started" ? " (working...)" : turn.status === "waiting" ? " (waiting)" : turn.status === "error" ? " (failed)" : "";
  return `Council · round ${turn.round} · ${turn.phase} · ${COUNCIL_ROLE_NAMES[turn.role]}${verdict}${state}`;
}

// Null for "started" turns - they carry no content, only that someone began working.
export function formatCouncilTurn(turn: CouncilTurnEvent): string | null {
  if (turn.status === "started") return null;
  const head = `── ${COUNCIL_ROLE_NAMES[turn.role]}${turn.model ? ` (${turn.model})` : ""} · round ${turn.round} · ${turn.phase}`;
  const lines = [head];
  if (turn.text) lines.push(turn.text.trim());
  for (const check of turn.checks ?? []) lines.push(`${check.ok ? "✓" : "✗"} ${check.id}${check.ok ? "" : `\n${check.output.trim().split("\n").slice(-12).join("\n")}`}`);
  if (turn.verdict) lines.push(turn.verdict === "APPROVE" ? "VERDICT: APPROVE" : "VERDICT: CHANGES REQUESTED");
  for (const issue of turn.issues ?? []) lines.push(`- ${issue.file}${issue.line ? `:${issue.line}` : ""} [${issue.severity}] ${issue.problem}\n  fix: ${issue.fix}`);
  if (turn.usage) lines.push(`tokens ${turn.usage.totalTokens.toLocaleString()} / ${turn.usage.budget.toLocaleString()}`);
  return lines.join("\n");
}
