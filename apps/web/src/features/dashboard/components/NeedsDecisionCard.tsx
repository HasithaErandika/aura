import { Link } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import type { Approval } from "@/shared/api/types.ts";
import { ApprovalRow } from "@/shared/components/ApprovalRow.tsx";
import { ClipboardCheckIcon } from "@/shared/icons/index.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { Section } from "@/shared/ui/Section.tsx";
import { SkeletonRows } from "@/shared/ui/SkeletonRows.tsx";

export function NeedsDecisionCard({ approvals, loading }: { approvals: Approval[] | null; loading: boolean }) {
  return (
    <Section
      className="xl:col-span-2"
      title="Needs a decision"
      description="Gates waiting on a person."
      actions={
        <Link to={paths.approvals} className="text-xs font-medium text-ink-600 hover:text-ink-900">
          Open inbox
        </Link>
      }
    >
      {loading && !approvals ? (
        <SkeletonRows rows={3} />
      ) : !approvals?.length ? (
        <EmptyState icon={<ClipboardCheckIcon className="size-5" />} title="No pending decisions" description="When an agent pauses for a human, the request appears here." />
      ) : (
        <ul className="divide-y divide-line">
          {approvals.map((a) => (
            <li key={a.id}>
              <ApprovalRow approval={a} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
