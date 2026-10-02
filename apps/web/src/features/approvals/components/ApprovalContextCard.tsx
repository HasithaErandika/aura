import type { Approval } from "@/shared/api/types.ts";
import { agentLabel } from "@/shared/lib/agents.ts";
import { formatDateTime, personName, timeUntil } from "@/shared/lib/format.ts";
import { roleLabel } from "@/shared/lib/roles.ts";
import { CardBody } from "@/shared/ui/CardBody.tsx";
import { KeyValueList } from "@/shared/ui/KeyValueList.tsx";
import { Section } from "@/shared/ui/Section.tsx";

export function ApprovalContextCard({ approval }: { approval: Approval }) {
  const expires = formatDateTime(approval.expiresAt);
  return (
    <Section title="Context">
      <CardBody>
        <KeyValueList
          columns={1}
          items={[
            { label: "Required role", value: approval.requiredRole ? roleLabel(approval.requiredRole) : "Requester" },
            { label: "Drafted by", value: agentLabel(approval.producingAgent) },
            { label: "Started by", value: approval.requester ? personName(approval.requester) : approval.requestedBy },
            { label: "Requested", value: formatDateTime(approval.requestedAt) },
            { label: "Expires", value: approval.status === "PENDING" ? `${expires} (${timeUntil(approval.expiresAt)})` : expires },
            { label: "Snapshot hash", value: <span className="font-mono text-xs">{approval.snapshotHash.slice(0, 16)}</span> },
          ]}
        />
      </CardBody>
    </Section>
  );
}
