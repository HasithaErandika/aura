import type { Approval, Run } from "@/shared/api/types.ts";

export type RunStepKind = "tool-call" | "tool-result" | "tool-error" | "text" | "suspended" | "resumed" | "error" | "finish" | "progress";

export interface RunStep {
  id: number;
  seq: number;
  kind: RunStepKind;
  toolName: string | null;
  toolCallId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface RunDetail {
  run: Run;
  steps: RunStep[];
  approvals: Approval[];
}
