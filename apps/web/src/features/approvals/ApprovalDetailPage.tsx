import { useParams } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import { useProfile } from "@/shared/auth/useAuth.ts";
import { ApprovalStatusPill } from "@/shared/components/ApprovalStatusPill.tsx";
import { GateDecisionCard } from "@/shared/components/GateDecisionCard.tsx";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { canUseWorkspace } from "@/shared/lib/access.ts";
import { toPendingGate } from "@/shared/lib/approvals.ts";
import { gateTitle } from "@/shared/lib/pipeline.ts";
import { AsyncView } from "@/shared/ui/AsyncView.tsx";
import { BackLink } from "@/shared/ui/BackLink.tsx";
import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { TwoColumn } from "@/shared/ui/TwoColumn.tsx";
import { approvalsApi } from "./api.ts";
import { ApprovalContextCard } from "./components/ApprovalContextCard.tsx";
import { ContinuationCard } from "./components/ContinuationCard.tsx";
import { DecisionRecordCard } from "./components/DecisionRecordCard.tsx";
import { RunLinkCard } from "./components/RunLinkCard.tsx";
import { SnapshotCard } from "./components/SnapshotCard.tsx";
import { useDecisionStream } from "./hooks/useDecisionStream.ts";

export function ApprovalDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const me = useProfile();
  const state = useAsync(() => approvalsApi.get(id), [id]);
  const { reload } = state;
  const { busy, continuation, decide } = useDecisionStream(() => void reload());

  return (
    <AsyncView state={state}>
      {({ approval, run }) => (
        <>
          <PageHeader
            back={<BackLink to={paths.approvals}>Back to inbox</BackLink>}
            title={gateTitle(approval.gate)}
            description={approval.gate ? `On approval: ${approval.gate.outcome}` : "The agent paused to ask the person who started the run."}
            actions={<ApprovalStatusPill status={approval.status} />}
          />
          <TwoColumn
            main={
              <>
                {approval.snapshot ? <SnapshotCard snapshot={approval.snapshot} /> : null}
                {approval.status === "PENDING" ? (
                  <GateDecisionCard
                    gate={{ ...toPendingGate(approval), snapshot: null }}
                    busy={busy}
                    onDecide={(body) => void decide(approval.id, approval.snapshotHash, body)}
                  />
                ) : (
                  <DecisionRecordCard approval={approval} />
                )}
                {continuation ? <ContinuationCard continuation={continuation} busy={busy} /> : null}
              </>
            }
            aside={
              <>
                <ApprovalContextCard approval={approval} />
                {run ? <RunLinkCard run={run} canOpenConversation={approval.requestedBy === me.id && canUseWorkspace(me)} /> : null}
              </>
            }
          />
        </>
      )}
    </AsyncView>
  );
}
