import { AlertIcon, CheckIcon, TicketIcon } from "@/shared/icons/index.tsx";
import type { AsyncState } from "@/shared/hooks/useAsync.ts";
import { ErrorAlert } from "@/shared/ui/ErrorAlert.tsx";
import { Skeleton } from "@/shared/ui/Skeleton.tsx";
import { useComments } from "../hooks/useComments.ts";
import { pipelineProgress } from "../lib/pipeline.ts";
import type { JiraEpicDetail } from "../types.ts";
import { CommentThread } from "./CommentThread.tsx";
import { EpicHeader } from "./EpicHeader.tsx";
import { IssueSection } from "./IssueSection.tsx";
import { PipelineTracker } from "./PipelineTracker.tsx";

function EpicBody({ detail, onChanged }: { detail: JiraEpicDetail; onChanged: () => void }) {
  const { epic, stories, tasks, bugs } = detail;
  const comments = useComments(epic.key);

  return (
    <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-4 border-b border-line px-4 py-4 sm:px-5">
        <EpicHeader epic={epic} />
        <PipelineTracker stages={pipelineProgress("Epic", comments.state.data ?? [])} />
      </div>
      <IssueSection title="Stories" issues={stories} icon={TicketIcon} onChanged={onChanged} />
      <IssueSection title="Tasks" issues={tasks} icon={CheckIcon} onChanged={onChanged} />
      <IssueSection title="Bugs" issues={bugs} icon={AlertIcon} onChanged={onChanged} />
      <div className="px-4 py-4 sm:px-5">
        <CommentThread issueKey={epic.key} comments={comments} />
      </div>
    </div>
  );
}

export function EpicDetail({ epicKey, state }: { epicKey: string; state: AsyncState<JiraEpicDetail | null> }) {
  if (state.data?.epic.key === epicKey) return <EpicBody key={state.data.epic.key} detail={state.data} onChanged={() => void state.reload()} />;
  if (state.error) return <ErrorAlert error={state.error} onRetry={() => void state.reload()} className="m-5" />;
  return (
    <div className="space-y-4 p-5" role="status" aria-label="Loading Epic">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
