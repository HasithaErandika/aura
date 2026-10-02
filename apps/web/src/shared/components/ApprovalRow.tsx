import { Link } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import type { Approval } from "../api/types.ts";
import { ChevronRightIcon } from "../icons/index.tsx";
import { agentLabel } from "../lib/agents.ts";
import { personName, timeAgo, timeUntil, truncate } from "../lib/format.ts";
import { gateTitle } from "../lib/pipeline.ts";
import { roleLabel } from "../lib/roles.ts";
import { Badge } from "../ui/Badge.tsx";
import { ApprovalStatusPill } from "./ApprovalStatusPill.tsx";

export function ApprovalRow({ approval }: { approval: Approval }) {
  const meta = [
    approval.requiredRole ? `Requires ${roleLabel(approval.requiredRole)}` : "Requester answers",
    approval.producingAgent ? agentLabel(approval.producingAgent) : null,
    approval.requester ? `Started by ${personName(approval.requester)}` : null,
    timeAgo(approval.requestedAt),
    approval.status === "PENDING" ? timeUntil(approval.expiresAt) : null,
  ].filter(Boolean);

  return (
    <Link to={paths.approval(approval.id)} className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-ink-50 focus-visible:bg-ink-50 focus-visible:outline-none sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-ink-900">{gateTitle(approval.gate, "Question for the requester")}</p>
          <ApprovalStatusPill status={approval.status} />
          {approval.canDecide ? <Badge tone="brand">Your decision</Badge> : null}
        </div>
        <p className="mt-1 line-clamp-2 text-sm break-words text-ink-700">{truncate(approval.question, 200)}</p>
        <p className="mt-1 text-xs text-ink-500">{meta.join(" · ")}</p>
      </div>
      <ChevronRightIcon className="size-4 shrink-0 text-ink-400" aria-hidden />
    </Link>
  );
}
