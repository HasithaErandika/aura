import { Link } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import { RunStatusPill } from "@/shared/components/RunStatusPill.tsx";
import { ToolActivity } from "@/shared/components/ToolActivity.tsx";
import { Alert } from "@/shared/ui/Alert.tsx";
import { CardBody } from "@/shared/ui/CardBody.tsx";
import { Markdown } from "@/shared/ui/Markdown.tsx";
import { Section } from "@/shared/ui/Section.tsx";
import { Spinner } from "@/shared/ui/Spinner.tsx";
import type { Continuation } from "../hooks/useDecisionStream.ts";

export function ContinuationCard({ continuation, busy }: { continuation: Continuation; busy: boolean }) {
  return (
    <Section
      title="Agent continuation"
      description={busy ? "The Orchestrator is continuing with your decision" : continuation.status ? "The turn finished" : undefined}
      actions={continuation.status ? <RunStatusPill status={continuation.status} /> : busy ? <Spinner size="sm" /> : null}
    >
      <CardBody className="space-y-3">
        {continuation.tools.map((t) => (
          <ToolActivity key={t.toolCallId} tool={t} />
        ))}
        {continuation.text ? <Markdown source={continuation.text} className="text-sm text-ink-800" /> : null}
        {continuation.error ? <Alert tone="danger">{continuation.error}</Alert> : null}
        {continuation.nextApprovalId ? (
          <Alert
            tone="warning"
            title="The agent paused again"
            actions={
              <Link to={paths.approval(continuation.nextApprovalId)} className="text-xs font-semibold underline">
                Open next request
              </Link>
            }
          >
            A new decision is waiting.
          </Alert>
        ) : null}
        {!busy && !continuation.text && !continuation.tools.length && !continuation.error && !continuation.nextApprovalId ? <p className="text-sm text-ink-500">No further output.</p> : null}
      </CardBody>
    </Section>
  );
}
