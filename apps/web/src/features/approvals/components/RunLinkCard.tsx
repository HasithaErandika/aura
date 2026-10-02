import { paths } from "@/app/paths.ts";
import { RunStatusPill } from "@/shared/components/RunStatusPill.tsx";
import { CardBody } from "@/shared/ui/CardBody.tsx";
import { LinkButton } from "@/shared/ui/LinkButton.tsx";
import { Section } from "@/shared/ui/Section.tsx";
import type { ApprovalRunRef } from "../types.ts";

export function RunLinkCard({ run, canOpenConversation }: { run: ApprovalRunRef; canOpenConversation: boolean }) {
  return (
    <Section title="Run" actions={<RunStatusPill status={run.status} />}>
      <CardBody className="space-y-3">
        <p className="text-sm break-words text-ink-800">{run.title ?? "Untitled run"}</p>
        <div className="flex flex-wrap gap-2">
          <LinkButton to={paths.run(run.id)} size="sm">
            Run progress
          </LinkButton>
          {canOpenConversation ? (
            <LinkButton to={paths.workspaceThread(run.threadId)} size="sm" variant="ghost">
              Open conversation
            </LinkButton>
          ) : null}
        </div>
      </CardBody>
    </Section>
  );
}
