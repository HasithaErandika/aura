// Plain-language view of the runtime's tool gateway events (agent-runtime gateway/gateway.ts),
// shared by the chat's tool activity and the Run Console timeline.

export interface GatewayFinding {
  source: string;
  rule: string;
  severity: "high" | "medium";
  excerpt: string;
}

export interface GatewayEvent {
  source?: "gateway";
  tool?: string;
  mode?: string;
  tier?: string;
  outcome?: "ok" | "failed" | "blocked" | "error";
  reason?: string;
  message?: string;
  approvalId?: string | null;
  durationMs?: number;
  findings?: GatewayFinding[];
}

export type Tone = "neutral" | "success" | "warning" | "danger";

const TOOL_LABELS: Record<string, string> = {
  delegate_to_po: "PO Agent",
  delegate_to_ba: "BA Agent",
  delegate_to_architect: "Architect Agent",
  delegate_to_dev: "Dev Agent",
  delegate_to_code: "Coding Agent",
  delegate_to_qa: "QA Agent",
  delegate_to_test: "Tester Agent",
  delegate_to_deploy: "Deployer Agent",
  delegate_to_git: "Git tool",
  delegate_to_ci: "CI tool",
};

const REASONS: Record<string, string> = {
  no_human_decision: "no human approval for this step",
  approval_reused: "that approval was already used for another step",
  not_approved: "the step was not approved",
  loop_guard: "stopped a loop",
  unknown_mode: "unknown action",
  missing_draft: "no draft given",
  injection: "possible prompt injection in the source",
};

export function toolLabel(tool: string | undefined): string {
  return (tool && TOOL_LABELS[tool]) ?? tool ?? "tool";
}

export function gatewaySummary(e: GatewayEvent): { title: string; tone: Tone } {
  const what = `${toolLabel(e.tool)}${e.mode ? ` (${e.mode})` : ""}`;
  if (e.outcome === "blocked") return { title: `Safety check stopped ${what}: ${REASONS[e.reason ?? ""] ?? e.reason ?? "refused"}`, tone: e.reason === "loop_guard" ? "warning" : "danger" };
  if (e.findings?.length) return { title: `Possible prompt injection found while running ${what}`, tone: "warning" };
  if (e.outcome === "error" || e.outcome === "failed") return { title: `${what} failed after the safety check`, tone: "danger" };
  return { title: `Approved step ran: ${what}`, tone: "success" };
}

export function gatewayDetail(e: GatewayEvent): string {
  const lines: string[] = [];
  if (e.message) lines.push(e.message);
  if (e.approvalId) lines.push(`Approval: ${e.approvalId}`);
  for (const f of e.findings ?? []) lines.push(`[${f.severity}] ${f.rule} in ${f.source}: "${f.excerpt}"`);
  if (typeof e.durationMs === "number") lines.push(`Took ${(e.durationMs / 1000).toFixed(1)}s`);
  return lines.join("\n");
}
