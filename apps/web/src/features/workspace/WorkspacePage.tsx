import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../shared/auth/useAuth.ts";
import { useAsync } from "../../shared/hooks/useAsync.ts";
import { describeError, isRuntimeUnavailable } from "../../shared/api/errors.ts";
import { workspaceApi } from "./api.ts";
import { useConversation } from "./hooks/useConversation.ts";
import { ThreadList } from "./components/ThreadList.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { GateCard } from "./components/GateCard.tsx";
import { Composer } from "./components/Composer.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Button } from "../../shared/ui/Button.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { RunStatusPill } from "../../shared/ui/StatusPill.tsx";
import { EmptyState } from "../../shared/ui/EmptyState.tsx";
import { Spinner } from "../../shared/ui/Spinner.tsx";
import {
  ChatIcon,
  ExternalLinkIcon,
  EditIcon,
  CheckIcon,
  XIcon,
  AgentIcon,
  SparkleIcon,
  PlusIcon,
  AgentLiveIcon,
} from "../../shared/icons/index.tsx";
import { paths } from "../../app/paths.ts";
import { roleLabel } from "../../shared/lib/roles.ts";

const AGENT_ORDER = ["orchestrator", "po-agent", "ba-agent", "architect-agent", "dev-agent"];

export function WorkspacePage() {
  const { profile } = useAuth();
  const { threadId = null } = useParams<{ threadId: string }>();
  const navigate = useNavigate();

  const agentsState = useAsync(() => workspaceApi.agents(), []);
  const runnable = useMemo(
    () =>
      (agentsState.data ?? [])
        .filter((a) => a.access === "run")
        .sort((a, b) => AGENT_ORDER.indexOf(a.id) - AGENT_ORDER.indexOf(b.id)),
    [agentsState.data],
  );

  const agent = runnable.find((a) => a.id === "orchestrator") ?? runnable[0] ?? null;
  const agentId = agent?.id ?? "orchestrator";

  const threadsState = useAsync(() => (agent ? workspaceApi.threads(agentId) : Promise.resolve([])), [agentId, agent !== null]);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Editing thread title in header state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [headerTitleInput, setHeaderTitleInput] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  const conversation = useConversation(agentId, threadId);

  const activeThread = useMemo(
    () => (threadsState.data ?? []).find((t) => t.id === threadId) ?? null,
    [threadsState.data, threadId],
  );

  // Keep the thread list fresh after a turn
  useEffect(() => {
    if (!conversation.busy) void threadsState.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.busy, conversation.runStatus]);

  async function newThread(initialMessage?: string) {
    if (!agent) return;
    setCreating(true);
    setActionError(null);
    try {
      const thread = await workspaceApi.createThread(agentId);
      await threadsState.reload();
      navigate(paths.workspaceThread(thread.id), { state: initialMessage ? { initialMessage } : undefined });
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleSendMessage(text: string) {
    if (threadId) {
      await conversation.send(text);
    } else {
      await newThread(text);
    }
  }

  async function handleRenameThread(targetThreadId: string, newTitle: string) {
    try {
      await workspaceApi.updateThread(agentId, targetThreadId, newTitle);
      await threadsState.reload();
    } catch (err) {
      setActionError(describeError(err));
    }
  }

  async function handleDeleteThread(targetThreadId: string) {
    try {
      await workspaceApi.deleteThread(agentId, targetThreadId);
      await threadsState.reload();
      if (targetThreadId === threadId) {
        navigate(paths.workspace);
      }
    } catch (err) {
      setActionError(describeError(err));
    }
  }

  function startHeaderTitleEdit() {
    setHeaderTitleInput(activeThread?.title ?? "Untitled Chat");
    setIsEditingTitle(true);
  }

  async function saveHeaderTitle() {
    if (!threadId || !headerTitleInput.trim() || savingTitle) return;
    setSavingTitle(true);
    try {
      await handleRenameThread(threadId, headerTitleInput.trim());
      setIsEditingTitle(false);
    } finally {
      setSavingTitle(false);
    }
  }

  function handleHeaderTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void saveHeaderTitle();
    } else if (e.key === "Escape") {
      setIsEditingTitle(false);
    }
  }

  const starterInfo = useMemo(() => {
    const role = profile?.role;
    if (role === "project_owner") {
      return {
        guide: "Define high-level product goals and turn ideas into actionable Epics.",
        starters: [
          "Create a new Epic from business requirements",
          "Define product vision and acceptance criteria",
        ],
      };
    }
    if (role === "business_analyst") {
      return {
        guide: "Decompose Epics into structured user stories with acceptance criteria.",
        starters: [
          "Break down Epic into user stories: Epic-Key",
          "Refine acceptance criteria & definition of done",
        ],
      };
    }
    if (role === "architect") {
      return {
        guide: "Design system architecture, data models, API specs, and ADRs.",
        starters: [
          "Design system architecture for Epic: Epic-Key",
          "Draft architecture decision records (ADRs)",
        ],
      };
    }
    if (role === "developer") {
      return {
        guide: "Scaffold sandboxed containers and implement code for assigned tasks.",
        starters: [
          "Scaffold sandbox container for Task: Task-Key",
          "Implement code solution for Task: Task-Key",
        ],
      };
    }
    return {
      guide: "Brief the Orchestrator agent to guide workflows across specialized roles.",
      starters: [
        "Brief Orchestrator on new feature requirements",
        "Review active agent tasks & pending approvals",
      ],
    };
  }, [profile?.role]);

  if (agentsState.loading) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-subtle">
        <Spinner label="Loading Agent Workspace..." />
      </div>
    );
  }

  if (agentsState.error || !agent) {
    const runtimeDown = agentsState.error && /unreachable|runtime/i.test(agentsState.error);
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <EmptyState
          icon={<ChatIcon className="size-6" />}
          title={runtimeDown ? "The agent runtime is unreachable" : agentsState.error ? "Could not load agents" : "No agent is granted to your role yet"}
          description={
            runtimeDown
              ? "Ensure apps/agent-runtime is running (npm run dev, port 4111)."
              : (agentsState.error ?? `Your role (${profile ? roleLabel(profile.role) : "unknown"}) has no active run grant.`)
          }
          action={
            <Button variant="secondary" onClick={() => void agentsState.reload()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const composerDisabled = (threadId ? Boolean(conversation.pendingGate) || conversation.loading : false) || creating;
  const composerPlaceholder = conversation.pendingGate
    ? "Resolve the pending decision above to continue"
    : profile?.role === "business_analyst"
      ? "Describe the Epic to break down or provide an Epic key..."
      : profile?.role === "architect"
        ? "Provide Epic keys to design system architecture..."
        : profile?.role === "developer"
          ? "Provide a Task key to scaffold or implement code..."
          : "Type your message or instruction for the Orchestrator...";

  return (
    <div className="flex h-full min-h-0 bg-surface-subtle">
      {/* Sidebar Thread List */}
      <aside className="hidden w-72 shrink-0 border-r border-line bg-surface lg:block">
        <ThreadList
          threads={threadsState.data ?? []}
          activeId={threadId}
          loading={threadsState.loading}
          onNew={() => navigate(paths.workspace)}
          creating={creating}
          onRename={handleRenameThread}
          onDelete={handleDeleteThread}
        />
      </aside>

      {/* Main Chat Workspace */}
      <section className="flex min-w-0 flex-1 flex-col bg-surface-subtle">
        {/* Workspace Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center">
              <AgentLiveIcon running={conversation.busy} size={28} />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {/* Chat Title / Editing Title */}
                {threadId && isEditingTitle ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={headerTitleInput}
                      onChange={(e) => setHeaderTitleInput(e.target.value)}
                      onKeyDown={handleHeaderTitleKeyDown}
                      className="rounded border border-ink-400 bg-surface px-2 py-0.5 text-sm font-semibold text-ink-900 focus:outline-none focus:ring-1 focus:ring-ink-500"
                    />
                    <button
                      type="button"
                      onClick={() => void saveHeaderTitle()}
                      disabled={savingTitle}
                      className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                      title="Save chat title"
                    >
                      <CheckIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingTitle(false)}
                      className="rounded p-1 text-ink-400 hover:bg-ink-100"
                      title="Cancel"
                    >
                      <XIcon className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="group flex items-center gap-2 min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {threadId ? activeThread?.title ?? "Untitled Chat" : agent.name}
                    </p>
                    {threadId ? (
                      <button
                        type="button"
                        onClick={startHeaderTitleEdit}
                        className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition-colors opacity-75 group-hover:opacity-100"
                        title="Edit chat name"
                      >
                        <EditIcon className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                )}

                {agent.model ? <Badge tone="outline" className="text-[10px] uppercase font-mono">{agent.model}</Badge> : null}
                {conversation.runStatus ? <RunStatusPill status={conversation.runStatus} /> : null}
              </div>

              <p className="mt-0.5 max-w-xl truncate text-xs text-ink-500">
                {agent.description ?? "Orchestrates tasks across specialized AI agents."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {conversation.run ? (
              <Link
                to={paths.run(conversation.run.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-subtle transition-colors shadow-xs"
              >
                View run progress
                <ExternalLinkIcon className="size-3.5" />
              </Link>
            ) : null}

            <Button size="sm" variant="secondary" className="lg:hidden" onClick={() => navigate(paths.workspace)} icon={<PlusIcon className="size-3.5" />}>
              New Chat
            </Button>
          </div>
        </div>

        {/* Message Feed Area */}
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          <div className="mx-auto max-w-4xl">
            {actionError ? (
              <Alert tone="danger" className="mb-4">
                {actionError}
              </Alert>
            ) : null}
            {conversation.error ? (
              <Alert tone={isRuntimeUnavailable(conversation.error) ? "warning" : "danger"} className="mb-4" title="Turn incomplete">
                {conversation.error}
              </Alert>
            ) : null}

            {!threadId ? (
              <StarterPanel
                agentName={agent.name}
                roleLabel={profile ? roleLabel(profile.role) : "User"}
                info={starterInfo}
                onPick={(text) => void handleSendMessage(text)}
                creating={creating}
              />
            ) : conversation.loading ? (
              <div className="flex justify-center py-20">
                <Spinner label="Loading conversation..." />
              </div>
            ) : conversation.messages.length === 0 && !conversation.streaming ? (
              <StarterPanel
                agentName={agent.name}
                roleLabel={profile ? roleLabel(profile.role) : "User"}
                info={starterInfo}
                onPick={(text) => void handleSendMessage(text)}
                creating={conversation.busy || creating}
              />
            ) : (
              <MessageList messages={conversation.messages} streaming={conversation.streaming}>
                {conversation.pendingGate ? (
                  <GateCard
                    gate={conversation.pendingGate}
                    busy={conversation.busy}
                    onDecide={(body) => void conversation.decide(body)}
                  />
                ) : null}
              </MessageList>
            )}
          </div>
        </div>

        {/* Composer Footer */}
        <div className="border-t border-line bg-surface px-4 py-3 sm:px-8">
          <div className="mx-auto max-w-4xl">
            <Composer
              disabled={composerDisabled}
              busy={conversation.busy || creating}
              placeholder={composerPlaceholder}
              onSend={(text) => void handleSendMessage(text)}
              onCancel={conversation.cancel}
            />
          </div>
        </div>
      </section>

      <InitialMessageSender threadId={threadId} busy={conversation.busy} loading={conversation.loading} send={conversation.send} />
    </div>
  );
}

function StarterPanel({
  agentName,
  roleLabel,
  info,
  onPick,
  creating,
}: {
  agentName: string;
  roleLabel: string;
  info: { guide: string; starters: string[] };
  onPick: (text: string) => void;
  creating: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-xs text-center">
        <div className="mx-auto flex items-center justify-center">
          <AgentLiveIcon running={false} size={48} />
        </div>

        <h2 className="mt-4 text-lg font-bold text-ink-900">Brief the {agentName}</h2>
        <div className="mt-1.5 flex items-center justify-center gap-2">
          <span className="inline-flex items-center rounded-md bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-700">
            Role: {roleLabel}
          </span>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-500 max-w-md mx-auto">
          {info.guide} Select a quick action below or type your message in the box to start.
        </p>

        {info.starters.length > 0 ? (
          <div className="mt-6 space-y-2 text-left">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 px-1">Suggested Quick Actions</p>
            <div className="grid grid-cols-1 gap-2">
              {info.starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={creating}
                  onClick={() => onPick(s)}
                  className="group flex items-center justify-between rounded-xl border border-line bg-surface-subtle px-4 py-3 text-xs text-ink-800 transition-all duration-150 hover:border-ink-400 hover:bg-surface hover:shadow-xs disabled:opacity-50"
                >
                  <span className="font-medium truncate pr-2">{s}</span>
                  <span className="text-ink-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink-700">→</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InitialMessageSender({
  threadId,
  busy,
  loading,
  send,
}: {
  threadId: string | null;
  busy: boolean;
  loading: boolean;
  send: (text: string) => Promise<void>;
}) {
  const [consumed, setConsumed] = useState<string | null>(null);
  useEffect(() => {
    if (!threadId || busy || loading) return;
    const state = window.history.state as { usr?: { initialMessage?: string } } | null;
    const initial = state?.usr?.initialMessage;
    if (initial && consumed !== threadId) {
      setConsumed(threadId);
      window.history.replaceState({ ...window.history.state, usr: {} }, "");
      void send(initial);
    }
  }, [threadId, busy, loading, consumed, send]);
  return null;
}
