import type { Approval, RunStatus } from "@/shared/api/types.ts";

export interface ApprovalRunRef {
  id: string;
  title: string | null;
  status: RunStatus;
  threadId: string;
}

export interface ApprovalDetail {
  approval: Approval;
  run: ApprovalRunRef | null;
}
