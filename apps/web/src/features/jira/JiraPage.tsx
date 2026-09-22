import { useEffect, useState } from "react";
import { useAsync, type AsyncState } from "../../shared/hooks/useAsync.ts";
import { describeError } from "../../shared/api/errors.ts";
import { jiraApi } from "./api.ts";
import { STATUS_TONE, priorityTone } from "./format.ts";
import type { JiraComment, JiraEpicDetail, JiraIssueDetail, JiraIssueSummary, JiraTransition } from "../../types/api.ts";
import { PageHeader } from "../../shared/ui/PageHeader.tsx";
import { Card } from "../../shared/ui/Card.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Input, Select, Textarea } from "../../shared/ui/Field.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Skeleton } from "../../shared/ui/Skeleton.tsx";
import { Spinner } from "../../shared/ui/Spinner.tsx";
import { AlertIcon, CheckIcon, ChevronRightIcon, ExternalLinkIcon, LayersIcon, PersonIcon, SearchIcon, SendIcon, TicketIcon } from "../../shared/icons/index.tsx";
import { timeAgo, truncate } from "../../shared/lib/format.ts";
import { cn } from "../../shared/lib/cn.ts";

// Debounces the search box so every keystroke doesn't fire a Jira query.
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function JiraPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 300);
  const [selectedEpic, setSelectedEpic] = useState<string | null>(null);

  const statusState = useAsync(() => jiraApi.status(), []);
  // Fires alongside statusState rather than waiting on it - the epics call only needs the
  // `configured` flag to know whether to *display* its result, not to start. Its error is
  // never shown when Jira isn't configured, since EpicList only renders once configured is true.
  const epicsState = useAsync(() => jiraApi.epics(debouncedQuery), [debouncedQuery]);
  const epics = epicsState.data ?? [];

  useEffect(() => {
    if (!selectedEpic && epics.length > 0) setSelectedEpic(epics[0]!.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epics.length]);

  const detailState = useAsync(() => (selectedEpic ? jiraApi.epic(selectedEpic) : Promise.resolve(null)), [selectedEpic]);

  return (
    <>
      <PageHeader title="Jira" description="Epics, Stories, and Tasks read straight from Jira - a live view, not the Orchestrator's drafts. Filing still goes through Gate approval." />

      {statusState.loading ? (
        <Card>
          <div className="space-y-2 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
        </Card>
      ) : statusState.error ? (
        <Alert tone="danger">{statusState.error}</Alert>
      ) : !statusState.data?.configured ? (
        <Card>
          <EmptyState
            icon={<TicketIcon className="size-5" />}
            title="Jira is not connected"
            description="Set JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN, and JIRA_PROJECT_KEY in the API's environment, then reload."
            action={
              <Button variant="secondary" onClick={() => void statusState.reload()}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]" style={{ height: "78vh" }}>
            <EpicList
              epics={epics}
              loading={epicsState.loading}
              error={epicsState.error}
              query={query}
              onQueryChange={setQuery}
              selected={selectedEpic}
              onSelect={setSelectedEpic}
            />
            <EpicDetail state={detailState} />
          </div>
        </Card>
      )}
    </>
  );
}

function EpicList({
  epics,
  loading,
  error,
  query,
  onQueryChange,
  selected,
  onSelect,
}: {
  epics: JiraIssueSummary[];
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col border-b border-line bg-neutral-soft/40 lg:border-b-0 lg:border-r">
      <div className="shrink-0 border-b border-line px-3 py-2.5">
        <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">Epics</p>
        <div className="relative mt-2">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
          <Input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Search epics" className="h-8 pl-8 text-xs" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {error ? (
          <Alert tone="danger" className="m-1.5">
            {error}
          </Alert>
        ) : loading && epics.length === 0 ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : epics.length === 0 ? (
          <EmptyState icon={<LayersIcon className="size-5" />} title="No Epics found" description={query ? "Try a different search." : "No Epics exist in this Jira project yet."} className="py-10" />
        ) : (
          <ul className="space-y-0.5 text-sm">
            {epics.map((epic) => {
              const isSelected = selected === epic.key;
              return (
                <li key={epic.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(epic.key)}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left hover:bg-ink-100",
                      isSelected ? "bg-brand-soft hover:bg-brand-soft" : "",
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <LayersIcon className={cn("size-3.5 shrink-0", isSelected ? "text-brand" : "text-ink-400")} />
                      <span className={cn("truncate font-mono text-xs font-semibold", isSelected ? "text-brand" : "text-ink-800")}>{epic.key}</span>
                      <Badge tone={STATUS_TONE[epic.statusCategory]} className="ml-auto shrink-0">
                        {epic.status}
                      </Badge>
                    </div>
                    <p className={cn("truncate text-xs", isSelected ? "text-brand/80" : "text-ink-500")}>{epic.summary || "(no summary)"}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function EpicDetail({ state }: { state: AsyncState<JiraEpicDetail | null> }) {
  if (state.error) {
    return (
      <div className="p-5">
        <Alert tone="danger">{state.error}</Alert>
      </div>
    );
  }
  if (state.loading && !state.data) {
    return (
      <div className="space-y-4 p-5">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!state.data) {
    return <EmptyState icon={<LayersIcon className="size-5" />} title="Select an Epic" description="Pick an Epic from the list to see its Stories and Tasks." className="h-full py-16" />;
  }

  const { epic, stories, tasks, bugs } = state.data;

  return (
    <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">
            <LayersIcon className="size-3" /> Epic
          </Badge>
          <span className="font-mono text-xs font-semibold text-ink-500">{epic.key}</span>
          <Badge tone={STATUS_TONE[epic.statusCategory]}>{epic.status}</Badge>
          {epic.priority ? <Badge tone={priorityTone(epic.priority)}>{epic.priority}</Badge> : null}
          {epic.url ? (
            <a href={epic.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-ink-900">
              Open in Jira <ExternalLinkIcon className="size-3.5" />
            </a>
          ) : null}
        </div>
        <h2 className="mt-2 text-base font-semibold text-ink-900">{epic.summary || "(no summary)"}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          {epic.assignee ? (
            <span className="inline-flex items-center gap-1">
              <PersonIcon className="size-3.5" /> {epic.assignee}
            </span>
          ) : null}
          {epic.updated ? <span>Updated {timeAgo(epic.updated)}</span> : null}
        </div>
        {epic.description ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{epic.description}</p> : null}
      </div>

      <IssueSection title="Stories" issues={stories} emptyHint="No Stories filed under this Epic yet." icon={TicketIcon} onChanged={() => void state.reload()} />
      <IssueSection title="Tasks" issues={tasks} emptyHint="No Tasks filed under this Epic yet." icon={CheckIcon} onChanged={() => void state.reload()} />
      <IssueSection title="Bugs" issues={bugs} emptyHint="No Bugs filed under this Epic yet." icon={AlertIcon} onChanged={() => void state.reload()} />
      <div className="px-5 py-4">
        <CommentsSection issueKey={epic.key} />
      </div>
    </div>
  );
}

// A real Jira comment thread - fetched live, oldest first, with a composer to post a new one -
// the same population of comments a human would see opening this issue in Jira itself, kept in
// one place instead of a separate trip there.
function CommentsSection({ issueKey }: { issueKey: string }) {
  const commentsState = useAsync(() => jiraApi.comments(issueKey), [issueKey]);
  const [comments, setComments] = useState<JiraComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    setComments(commentsState.data ?? null);
  }, [commentsState.data]);

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const comment = await jiraApi.comment(issueKey, draft.trim());
      setComments((prev) => [...(prev ?? []), comment]);
      setDraft("");
    } catch (err) {
      setSendError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">Comments</h3>
        <Badge tone="outline">{comments?.length ?? 0}</Badge>
      </div>
      {commentsState.error ? (
        <Alert tone="danger">{commentsState.error}</Alert>
      ) : commentsState.loading && comments === null ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="space-y-2.5">
          {comments && comments.length > 0 ? (
            <ul className="space-y-2.5">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-line bg-ink-50/60 px-3 py-2.5 text-xs">
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
  );
}

function IssueSection({
  title,
  issues,
  emptyHint,
  icon: Icon,
  onChanged,
}: {
  title: string;
  issues: JiraIssueSummary[];
  emptyHint: string;
  icon: typeof TicketIcon;
  onChanged: () => void;
}) {
  return (
    <div className="border-b border-line px-5 py-4 last:border-b-0">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{title}</h3>
        <Badge tone="outline">{issues.length}</Badge>
      </div>
      {issues.length === 0 ? (
        <p className="text-xs text-ink-400">{emptyHint}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {issues.map((issue) => (
            <IssueRow key={issue.key} issue={issue} icon={Icon} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({ issue, icon: Icon, onChanged }: { issue: JiraIssueSummary; icon: typeof TicketIcon; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<JiraIssueDetail | null>(null);
  const [transitions, setTransitions] = useState<JiraTransition[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Local override so the status badge updates the instant a transition succeeds, without
  // waiting on the parent's refetch (still triggered, via onChanged, to keep everything else
  // in sync - e.g. the Epic-level story/task counts if this ever affects them).
  const [statusOverride, setStatusOverride] = useState<{ status: string; statusCategory: JiraIssueSummary["statusCategory"] } | null>(null);
  const status = statusOverride ?? issue;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail && !loading) {
      setLoading(true);
      setError(null);
      try {
        const [issueDetail, issueTransitions] = await Promise.all([jiraApi.issue(issue.key), jiraApi.transitions(issue.key)]);
        setDetail(issueDetail);
        setTransitions(issueTransitions);
      } catch (err) {
        setError(describeError(err));
      } finally {
        setLoading(false);
      }
    }
  }

  async function move(transitionId: string) {
    if (!transitionId) return;
    setMoving(true);
    setMoveError(null);
    try {
      const updated = await jiraApi.transition(issue.key, transitionId);
      setDetail(updated);
      setStatusOverride({ status: updated.status, statusCategory: updated.statusCategory });
      setTransitions(await jiraApi.transitions(issue.key));
      onChanged();
    } catch (err) {
      setMoveError(describeError(err));
    } finally {
      setMoving(false);
    }
  }

  return (
    <li>
      <button type="button" onClick={() => void toggle()} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-ink-50">
        <Icon className="size-3.5 shrink-0 text-ink-400" />
        <span className="shrink-0 font-mono text-xs font-semibold text-ink-500">{issue.key}</span>
        <span className="min-w-0 flex-1 truncate text-ink-800">{issue.summary || "(no summary)"}</span>
        {issue.priority ? (
          <Badge tone={priorityTone(issue.priority)} className="hidden shrink-0 sm:inline-flex">
            {issue.priority}
          </Badge>
        ) : null}
        {issue.assignee ? <span className="hidden shrink-0 text-xs text-ink-400 sm:inline">{truncate(issue.assignee, 18)}</span> : null}
        <Badge tone={STATUS_TONE[status.statusCategory]} className="shrink-0">
          {status.status}
        </Badge>
        <ChevronRightIcon className={cn("size-3.5 shrink-0 text-ink-400 transition-transform", open && "rotate-90")} />
      </button>
      {open ? (
        <div className="border-t border-line bg-ink-50/60 px-3 py-3 text-xs">
          {loading ? (
            <Spinner size="sm" label="Loading" />
          ) : error ? (
            <p className="text-danger">{error}</p>
          ) : detail ? (
            <div className="space-y-3">
              {detail.description ? <p className="whitespace-pre-wrap leading-relaxed text-ink-700">{detail.description}</p> : <p className="text-ink-400">No description.</p>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-500">
                {detail.reporter ? <span>Reported by {detail.reporter}</span> : null}
                {detail.updated ? <span>Updated {timeAgo(detail.updated)}</span> : null}
                {detail.url ? (
                  <a href={detail.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-medium text-ink-600 hover:text-ink-900">
                    Open in Jira <ExternalLinkIcon className="size-3" />
                  </a>
                ) : null}
              </div>
              <div className="flex items-center gap-2 border-t border-line pt-2.5">
                <span className="font-medium text-ink-600">Progress:</span>
                {transitions && transitions.length > 0 ? (
                  <>
                    <Select
                      value=""
                      disabled={moving}
                      onChange={(e) => void move(e.target.value)}
                      className="h-7 w-auto max-w-[180px] text-xs"
                    >
                      <option value="" disabled>
                        Move to...
                      </option>
                      {transitions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.toStatus}
                        </option>
                      ))}
                    </Select>
                    {moving ? <Spinner size="sm" /> : null}
                  </>
                ) : (
                  <span className="text-ink-400">No further moves available.</span>
                )}
              </div>
              {moveError ? <p className="text-danger">{moveError}</p> : null}
              <div className="border-t border-line pt-2.5">
                <CommentsSection issueKey={issue.key} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
