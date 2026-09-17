import { Badge, type Tone } from "./Badge.tsx";
import type { ApprovalStatus, RunStatus } from "../../types/api.ts";

const runTone: Record<RunStatus, Tone> = {
  PENDING: "neutral",
  RUNNING: "warning",
  SUSPENDED_FOR_APPROVAL: "warning",
  SUCCEEDED: "success",
  FAILED: "danger",
  REJECTED: "neutral",
  EXPIRED: "danger",
  HALTED_LOOP_GUARD: "danger",
};

const runLabel: Record<RunStatus, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  SUSPENDED_FOR_APPROVAL: "Waiting for decision",
  SUCCEEDED: "Completed",
  FAILED: "Failed",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  HALTED_LOOP_GUARD: "Halted",
};

export function RunStatusPill({ status }: { status: RunStatus }) {
  return (
    <Badge tone={runTone[status]} dot={status === "RUNNING" || status === "SUSPENDED_FOR_APPROVAL"}>
      {runLabel[status]}
    </Badge>
  );
}

const approvalTone: Record<ApprovalStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  REVISION_REQUESTED: "neutral",
  ANSWERED: "success",
  EXPIRED: "danger",
};

const approvalLabel: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REVISION_REQUESTED: "Revision requested",
  ANSWERED: "Answered",
  EXPIRED: "Expired",
};

export function ApprovalStatusPill({ status }: { status: ApprovalStatus }) {
  return (
    <Badge tone={approvalTone[status]} dot={status === "PENDING"}>
      {approvalLabel[status]}
    </Badge>
  );
}
