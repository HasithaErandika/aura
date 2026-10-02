import { useSearchParams } from "react-router-dom";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { usePolling } from "../../shared/hooks/usePolling.ts";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Card, CardBody, CardHeader } from "../../shared/ui/Card.tsx";
import { Table, TBody, TD, TH, THead, TR } from "../../shared/ui/Table.tsx";
import { ExternalLinkIcon } from "../../shared/icons/index.tsx";
import { timeAgo } from "../../shared/lib/format.ts";
import { cn } from "../../shared/lib/cn.ts";
import { ciBadge, ciDetail, taskPrsApi } from "./prs.ts";

// QA follows each Task's pull request and its CI here (plan "Web app after this change"); the
// project's aura-ci.yml reports each run to AURA. No code is shown.
export function TaskPrsPanel() {
  const [params] = useSearchParams();
  const epicKey = params.get("epic")?.trim().toUpperCase() || null;
  const focus = params.get("task")?.trim().toUpperCase() || null;
  const state = useAsync(() => taskPrsApi.list(epicKey), [epicKey]);
  usePolling(() => state.reload(), 60_000, true);
  const prs = state.data?.taskPrs ?? [];

  return (
    <Card className="mb-4">
      <CardHeader title="Pull requests and CI" description={epicKey ? `Tasks of ${epicKey} with a pull request` : "Tasks with a pull request"} />
      <CardBody className="p-0">
        {state.error ? (
          <Alert tone="danger" className="m-4">
            {state.error}
          </Alert>
        ) : prs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-500">{state.loading ? "Loading…" : "No Task has opened a pull request yet. Developers open them from VS Code at Gate 6."}</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Task</TH>
                <TH>Pull request</TH>
                <TH>CI</TH>
                <TH>Reviewers</TH>
                <TH>Updated</TH>
              </TR>
            </THead>
            <TBody>
              {prs.map((pr) => {
                const ci = ciBadge(pr.ciState);
                return (
                  <TR key={pr.taskKey} className={cn(pr.taskKey === focus && "bg-brand-soft")}>
                    <TD className="font-semibold text-ink-900">{pr.taskKey}</TD>
                    <TD>
                      {pr.prUrl ? (
                        <a href={pr.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                          #{pr.prNumber} {pr.prTitle ?? ""}
                          <ExternalLinkIcon className="size-3.5" />
                        </a>
                      ) : (
                        <span className="text-ink-500">Branch {pr.branch} pushed, no pull request yet</span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex flex-col gap-1">
                        {pr.ciUrl ? (
                          <a href={pr.ciUrl} target="_blank" rel="noreferrer">
                            <Badge tone={ci.tone} dot={pr.ciState === "running"}>
                              {ci.label}
                            </Badge>
                          </a>
                        ) : (
                          <Badge tone={ci.tone}>{ci.label}</Badge>
                        )}
                        {ciDetail(pr) ? <span className="text-xs text-ink-500">{ciDetail(pr)}</span> : null}
                      </div>
                    </TD>
                    <TD className="text-xs text-ink-600">{pr.reviewers.length ? pr.reviewers.join(", ") : "—"}</TD>
                    <TD className="text-xs text-ink-500">{timeAgo(pr.ciUpdatedAt ?? pr.updatedAt)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}
