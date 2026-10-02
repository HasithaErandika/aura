import type { Approval } from "@/shared/api/types.ts";
import { ApprovalStatusPill } from "@/shared/components/ApprovalStatusPill.tsx";
import { formatDateTime } from "@/shared/lib/format.ts";
import { roleLabel } from "@/shared/lib/roles.ts";
import { CardBody } from "@/shared/ui/CardBody.tsx";
import { KeyValueList } from "@/shared/ui/KeyValueList.tsx";
import { Section } from "@/shared/ui/Section.tsx";

export function DecisionRecordCard({ approval }: { approval: Approval }) {
  const decision = approval.decision;
  return (
    <Section title="Decision">
      <CardBody>
        {decision ? (
          <KeyValueList
            items={[
              { label: "Outcome", value: <ApprovalStatusPill status={approval.status} /> },
              { label: "Decided by", value: roleLabel(decision.decidedByRole) },
              { label: "When", value: formatDateTime(decision.createdAt) },
              ...(decision.answer ? [{ label: "Answer", value: decision.answer }] : []),
              ...(decision.reason ? [{ label: "Reason", value: decision.reason }] : []),
            ]}
          />
        ) : (
          <p className="text-sm text-ink-600">
            {approval.status === "EXPIRED" ? "Nobody decided before the approval expired. The run closed as expired; it was not approved." : "No decision record."}
          </p>
        )}
      </CardBody>
    </Section>
  );
}
