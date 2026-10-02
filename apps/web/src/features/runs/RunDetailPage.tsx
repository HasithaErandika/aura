import { useParams } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import { useProfile } from "@/shared/auth/useAuth.ts";
import { ApprovalRow } from "@/shared/components/ApprovalRow.tsx";
import { RunStatusPill } from "@/shared/components/RunStatusPill.tsx";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { usePolling } from "@/shared/hooks/usePolling.ts";
import { isAdmin } from "@/shared/lib/access.ts";
import { formatDateTime, personName } from "@/shared/lib/format.ts";
import { roleLabel } from "@/shared/lib/roles.ts";
import { isRunActive, isRunStreaming } from "@/shared/lib/status.ts";
import { Alert } from "@/shared/ui/Alert.tsx";
import { AsyncView } from "@/shared/ui/AsyncView.tsx";
import { BackLink } from "@/shared/ui/BackLink.tsx";
import { CardBody } from "@/shared/ui/CardBody.tsx";
import { LinkButton } from "@/shared/ui/LinkButton.tsx";
import { Markdown } from "@/shared/ui/Markdown.tsx";
import { PageHeader } from "@/shared/ui/PageHeader.tsx";
import { Section } from "@/shared/ui/Section.tsx";
import { TwoColumn } from "@/shared/ui/TwoColumn.tsx";
import { runsApi } from "./api.ts";
import { RunDetailsCard } from "./components/RunDetailsCard.tsx";
import { RunTimeline } from "./components/RunTimeline.tsx";
import { StopRunButton } from "./components/StopRunButton.tsx";

export function RunDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const me = useProfile();
  const state = useAsync(() => runsApi.get(id), [id]);
  usePolling(state.reload, 5000, isRunActive(state.data?.run.status));

  return (
    <AsyncView state={state}>
      {({ run, steps, approvals }) => {
        const mine = me.id === run.requestedBy;
        const canStop = isRunStreaming(run.status) && (mine || isAdmin(me));
        return (
          <>
            <PageHeader
              back={<BackLink to={paths.runs}>Back to runs</BackLink>}
              title={run.title ?? "Untitled run"}
              description={`Started ${formatDateTime(run.startedAt)} by ${personName(run.requester)} (${roleLabel(run.requestedByRole)})`}
              actions={
                <>
                  <RunStatusPill status={run.status} />
                  {canStop ? <StopRunButton runId={run.id} onStopped={() => void state.reload()} /> : null}
                  {mine ? (
                    <LinkButton size="sm" to={paths.workspaceThread(run.threadId)}>
                      Open conversation
                    </LinkButton>
                  ) : null}
                </>
              }
            />
            {run.lastError ? (
              <Alert tone="danger" title="Last error">
                {run.lastError}
              </Alert>
            ) : null}
            <TwoColumn
              main={
                <>
                  <Section title="Progress" description="What the agents did, in order.">
                    <RunTimeline steps={steps} />
                  </Section>
                  {approvals.length > 0 ? (
                    <Section title="Human decisions" description="Every time this run paused for a person.">
                      <ul className="divide-y divide-line">
                        {approvals.map((a) => (
                          <li key={a.id}>
                            <ApprovalRow approval={a} />
                          </li>
                        ))}
                      </ul>
                    </Section>
                  ) : null}
                  {run.outputSummary ? (
                    <Section title="Final response">
                      <CardBody>
                        <Markdown source={run.outputSummary} className="text-sm text-ink-800" />
                      </CardBody>
                    </Section>
                  ) : null}
                </>
              }
              aside={
                <>
                  <RunDetailsCard run={run} />
                  {run.inputSummary ? (
                    <Section title="Request">
                      <CardBody>
                        <p className="text-sm break-words whitespace-pre-wrap text-ink-800">{run.inputSummary}</p>
                      </CardBody>
                    </Section>
                  ) : null}
                </>
              }
            />
          </>
        );
      }}
    </AsyncView>
  );
}
