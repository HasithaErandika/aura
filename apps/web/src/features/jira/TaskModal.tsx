import { useState } from "react";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { describeError } from "../../shared/api/errors.ts";
import { jiraApi } from "./api.ts";
import { STATUS_TONE, priorityTone } from "./format.ts";
import { Modal } from "../../shared/ui/Modal.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Skeleton } from "../../shared/ui/Skeleton.tsx";
import { Select, Textarea } from "../../shared/ui/Field.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Spinner } from "../../shared/ui/Spinner.tsx";
import { ExternalLinkIcon, PersonIcon, SendIcon } from "../../shared/icons/index.tsx";
import { timeAgo } from "../../shared/lib/format.ts";

// A focused view of one Jira issue (Task, Story, or Bug) - status, description, transitions, and
// comments - without leaving the current page. Reuses the exact same /jira endpoints the Jira
// page itself does, so what's shown here always matches what's shown there.
export function TaskModal({ issueKey, onClose }: { issueKey: string; onClose: () => void }) {
  const issueState = useAsync(() => jiraApi.issue(issueKey), [issueKey]);
  const transitionsState = useAsync(() => jiraApi.transitions(issueKey), [issueKey]);
  const commentsState = useAsync(() => jiraApi.comments(issueKey), [issueKey]);

  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [comments, setComments] = useState<Awaited<ReturnType<typeof jiraApi.comments>> | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const list = comments ?? commentsState.data ?? null;

  async function move(transitionId: string) {
    if (!transitionId) return;
    setMoving(true);
    setMoveError(null);
    try {
      await jiraApi.transition(issueKey, transitionId);
      await Promise.all([issueState.reload(), transitionsState.reload()]);
    } catch (err) {
      setMoveError(describeError(err));
    } finally {
      setMoving(false);
    }
  }

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const comment = await jiraApi.comment(issueKey, draft.trim());
      setComments((prev) => [...(prev ?? commentsState.data ?? []), comment]);
      setDraft("");
    } catch (err) {
      setSendError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  const issue = issueState.data;

  return (
    <Modal open onClose={onClose} title={issueKey} description={issue?.summary || undefined} widthClassName="max-w-2xl">
      {issueState.error ? (
        <Alert tone="danger">{issueState.error}</Alert>
      ) : issueState.loading && !issue ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : issue ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[issue.statusCategory]}>{issue.status}</Badge>
            {issue.priority ? <Badge tone={priorityTone(issue.priority)}>{issue.priority}</Badge> : null}
            {issue.assignee ? (
              <span className="inline-flex items-center gap-1 text-xs text-ink-500">
                <PersonIcon className="size-3.5" /> {issue.assignee}
              </span>
            ) : null}
            {issue.url ? (
              <a href={issue.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-ink-900">
                Open in Jira <ExternalLinkIcon className="size-3.5" />
              </a>
            ) : null}
          </div>

          {issue.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{issue.description}</p> : <p className="text-sm text-ink-400">No description.</p>}

          <div className="flex items-center gap-2 border-t border-line pt-3 text-sm">
            <span className="font-medium text-ink-600">Progress:</span>
            {transitionsState.data && transitionsState.data.length > 0 ? (
              <>
                <Select value="" disabled={moving} onChange={(e) => void move(e.target.value)} className="h-8 w-auto max-w-[200px] text-xs">
                  <option value="" disabled>
                    Move to...
                  </option>
                  {transitionsState.data.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.toStatus}
                    </option>
                  ))}
                </Select>
                {moving ? <Spinner size="sm" /> : null}
              </>
            ) : (
              <span className="text-xs text-ink-400">No further moves available.</span>
            )}
          </div>
          {moveError ? <p className="text-xs text-danger">{moveError}</p> : null}

          <div className="border-t border-line pt-3">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Comments</h3>
              <Badge tone="outline">{list?.length ?? 0}</Badge>
            </div>
            {commentsState.error ? (
              <Alert tone="danger">{commentsState.error}</Alert>
            ) : commentsState.loading && list === null ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="space-y-2.5">
                {list && list.length > 0 ? (
                  <ul className="space-y-2">
                    {list.map((c) => (
                      <li key={c.id} className="rounded-lg border border-line bg-ink-50/60 px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 text-ink-500">
                          <span className="font-medium text-ink-700">{c.author ?? "Unknown"}</span>
                          <span>{timeAgo(c.created)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed text-ink-700">{c.body}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-ink-400">No comments yet.</p>
                )}
                <div className="space-y-1.5">
                  <Textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a comment..." className="text-sm" />
                  {sendError ? <p className="text-xs text-danger">{sendError}</p> : null}
                  <div className="flex justify-end">
                    <Button size="sm" variant="primary" icon={<SendIcon className="size-3.5" />} onClick={() => void send()} loading={sending} disabled={!draft.trim()}>
                      Comment
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
