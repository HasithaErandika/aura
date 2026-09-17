import { Link } from "react-router-dom";
import type { Approval } from "../../../types/api.ts";
import { paths } from "../../../app/paths.ts";
import { ApprovalStatusPill } from "../../../shared/ui/StatusPill.tsx";
import { Badge } from "../../../shared/ui/Badge.tsx";
import { roleLabel } from "../../../shared/lib/roles.ts";
import { timeAgo, timeUntil, truncate } from "../../../shared/lib/format.ts";
import { ChevronRightIcon } from "../../../shared/icons/index.tsx";

export function ApprovalSummary({ approval }: { approval: Approval }) {
  const title = approval.gate ? `Gate ${approval.gate.number}: ${approval.gate.name}` : "Question for the requester";
  return (
    <Link to={paths.approval(approval.id)} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-ink-900">{title}</p>
          <ApprovalStatusPill status={approval.status} />
          {approval.canDecide ? <Badge tone="brand">Your decision</Badge> : null}
        </div>
        <p className="mt-1 truncate text-sm text-ink-700">{truncate(approval.question, 160)}</p>
        <p className="mt-1 text-xs text-ink-500">
          {approval.requiredRole ? `Requires ${roleLabel(approval.requiredRole)}` : "Requester answers"}
          {approval.requester ? ` · Started by ${approval.requester.fullName ?? approval.requester.email}` : ""}
          {` · ${timeAgo(approval.requestedAt)}`}
          {approval.status === "PENDING" ? ` · ${timeUntil(approval.expiresAt)}` : ""}
        </p>
      </div>
      <ChevronRightIcon className="size-4 shrink-0 text-ink-400" />
    </Link>
  );
}
