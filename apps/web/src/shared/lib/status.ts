import type { ApprovalStatus, RunStatus } from "../api/types.ts";
import type { StateTone } from "./tone.ts";

export const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ["PENDING", "RUNNING", "SUSPENDED_FOR_APPROVAL"];

export function isRunActive(status: RunStatus | null | undefined): boolean {
  return Boolean(status && ACTIVE_RUN_STATUSES.includes(status));
}

export function isRunStreaming(status: RunStatus | null | undefined): boolean {
  return status === "PENDING" || status === "RUNNING";
}

export const RUN_STATUS: Record<RunStatus, { label: string; tone: StateTone }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  RUNNING: { label: "Running", tone: "warning" },
  SUSPENDED_FOR_APPROVAL: { label: "Waiting for decision", tone: "warning" },
  SUCCEEDED: { label: "Completed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  REJECTED: { label: "Rejected", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "danger" },
  HALTED_LOOP_GUARD: { label: "Halted", tone: "danger" },
  INTERRUPTED: { label: "Interrupted", tone: "warning" },
};

export const APPROVAL_STATUS: Record<ApprovalStatus, { label: string; tone: StateTone }> = {
  PENDING: { label: "Pending", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  REVISION_REQUESTED: { label: "Revision requested", tone: "neutral" },
  ANSWERED: { label: "Answered", tone: "success" },
  EXPIRED: { label: "Expired", tone: "danger" },
};
