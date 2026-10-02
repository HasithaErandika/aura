import type { RunStatus } from "../api/types.ts";
import { RUN_STATUS } from "../lib/status.ts";
import { Badge } from "../ui/Badge.tsx";

export function RunStatusPill({ status }: { status: RunStatus }) {
  const { label, tone } = RUN_STATUS[status] ?? { label: status, tone: "neutral" };
  return (
    <Badge tone={tone} dot={status === "RUNNING" || status === "SUSPENDED_FOR_APPROVAL"}>
      {label}
    </Badge>
  );
}
