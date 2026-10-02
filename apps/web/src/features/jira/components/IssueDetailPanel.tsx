import { useAsync } from "@/shared/hooks/useAsync.ts";
import { timeAgo } from "@/shared/lib/format.ts";
import { AsyncView } from "@/shared/ui/AsyncView.tsx";
import { ExternalLink } from "@/shared/ui/ExternalLink.tsx";
import { Spinner } from "@/shared/ui/Spinner.tsx";
import { jiraApi } from "../api.ts";
import { useComments } from "../hooks/useComments.ts";
import { pipelineProgress } from "../lib/pipeline.ts";
import type { JiraIssueDetail } from "../types.ts";
import { CommentThread } from "./CommentThread.tsx";
import { PipelineTracker } from "./PipelineTracker.tsx";
import { StatusMover } from "./StatusMover.tsx";

export function IssueDetailPanel({ issueKey, issueType, onMoved }: { issueKey: string; issueType: string; onMoved: (issue: JiraIssueDetail) => void }) {
  const detail = useAsync(() => jiraApi.issue(issueKey), [issueKey]);
  const comments = useComments(issueKey);

  return (
    <div className="space-y-3 border-t border-line bg-ink-50/60 px-3 py-3 text-xs">
      <AsyncView state={detail} loading={<Spinner size="sm" label="Loading" />}>
        {(issue) => (
          <>
            {issue.description ? <p className="leading-relaxed break-words whitespace-pre-wrap text-ink-700">{issue.description}</p> : <p className="text-ink-400">No description.</p>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-500">
              {issue.reporter ? <span>Reported by {issue.reporter}</span> : null}
              {issue.updated ? <span>Updated {timeAgo(issue.updated)}</span> : null}
              {issue.url ? (
                <ExternalLink href={issue.url} className="sm:ml-auto">
                  Open in Jira
                </ExternalLink>
              ) : null}
            </div>
          </>
        )}
      </AsyncView>
      <div className="border-t border-line pt-2.5">
        <StatusMover
          issueKey={issueKey}
          onMoved={(issue) => {
            detail.setData(issue);
            onMoved(issue);
          }}
        />
      </div>
      <PipelineTracker stages={pipelineProgress(issueType, comments.state.data ?? [])} />
      <div className="border-t border-line pt-2.5">
        <CommentThread issueKey={issueKey} comments={comments} />
      </div>
    </div>
  );
}
