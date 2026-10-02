import type { ApprovalStatus } from "../api/types.ts";
import { APPROVAL_STATUS } from "../lib/status.ts";
import { Badge } from "../ui/Badge.tsx";

export function ApprovalStatusPill({ status }: { status: ApprovalStatus }) {
  const { label, tone } = APPROVAL_STATUS[status] ?? { label: status, tone: "neutral" };
  return (
    <Badge tone={tone} dot={status === "PENDING"}>
      {label}
    </Badge>
  );
}
