import { useEffect, useMemo, useState } from "react";
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
import { ChatIcon, ExternalLinkIcon } from "../../shared/icons/index.tsx";
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
  // The Orchestrator is the entry point for every role (it owns the human questions). Fall
  // back to the first runnable agent if the runtime is configured differently.
  const agent = runnable.find((a) => a.id === "orchestrator") ?? runnable[0] ?? null;
  const agentId = agent?.id ?? "orchestrator";

  const threadsState = useAsync(() => (agent ? workspaceApi.threads(agentId) : Promise.resolve([])), [agentId, agent !== null]);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const conversation = useConversation(agentId, threadId);

  // Keep the thread list fresh after a turn (the runtime generates titles asynchronously).
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

  const starters = useMemo(() => {
    const fromRuntime = agent?.suggestedPrompts ?? [];
    const byRole: string[] = [];
    if (profile?.role === "business_analyst") {
      byRole.push("An approved Epic already exists in Jira. Break it into Stories with acceptance criteria and a definition of done. Epic key: ");
    }
    if (profile?.role === "architect") {
      byRole.push("Approved Epics with Stories already exist in Jira. Design one shared architecture: decomposition, API/data/security design, ADRs, and tasks. Epic key(s) (comma-separated if more than one): ");
    }
    if (profile?.role === "developer") {
      byRole.push("An architecture Task is already filed in Jira. Scaffold it in a sandboxed container. Task key: ");
      byRole.push("A Task is already scaffolded. Implement it with a coding agent. Task key: ");
    }
    return [...byRole, ...fromRuntime];
  }, [agent, profile?.role]);

  if (agentsState.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading agents" />
      </div>
    );
  }

  if (agentsState.error || !agent) {
    const runtimeDown = agentsState.error && /unreachable|runtime/i.test(agentsState.error);
    return (
      <div className="mx-auto max-w-2xl px-6 py-10">
        <EmptyState
          icon={<ChatIcon className="size-5" />}
          title={runtimeDown ? "The agent runtime is not reachable" : agentsState.error ? "Could not load agents" : "No agent is granted to your role yet"}
          description={
            runtimeDown
              ? "Start apps/agent-runtime (npm run dev, port 4111) and the API will pick it up. Nothing you do here is lost."
              : (agentsState.error ?? `Your role (${profile ? roleLabel(profile.role) : "unknown"}) has no run grant in Phase 1. Project Owners, Business Analysts, Architects, and Developers work with the Orchestrator.`)
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

  const composerDisabled = !threadId || Boolean(conversation.pendingGate) || conversation.loading;
  const composerPlaceholder = !threadId
    ? "Start a conversation first"
    : conversation.pendingGate
      ? "Resolve the pending decision above to continue"
      : profile?.role === "business_analyst"
        ? "Describe the Epic to break down, or give the Orchestrator an approved Epic key"
        : profile?.role === "architect"
          ? "Give the Orchestrator one or more Epic keys with approved Stories to design a shared architecture"
          : profile?.role === "developer"
            ? "Give the Orchestrator a Task key to scaffold, or an already-scaffolded Task key to implement with a coding agent"
            : "Describe the business requirement you want turned into an Epic";

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-surface lg:block">
        <ThreadList threads={threadsState.data ?? []} activeId={threadId} loading={threadsState.loading} onNew={() => void newThread()} creating={creating} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-ink-900">{agent.name}</p>
              {agent.model ? <Badge tone="outline">{agent.model}</Badge> : null}
              {conversation.runStatus ? <RunStatusPill status={conversation.runStatus} /> : null}
            </div>
            {agent.description ? <p className="mt-0.5 max-w-3xl truncate text-xs text-ink-500">{agent.description}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {conversation.run ? (
              <Link to={paths.run(conversation.run.id)} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600 hover:text-ink-900">
                View run progress
                <ExternalLinkIcon className="size-3.5" />
              </Link>
            ) : null}
            <Button size="sm" variant="secondary" className="lg:hidden" onClick={() => void newThread()} loading={creating}>
              New conversation
            </Button>
          </div>
        </div>

        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-4xl">
            {actionError ? (
              <Alert tone="danger" className="mb-4">
                {actionError}
              </Alert>
            ) : null}
            {conversation.error ? (
              <Alert tone={isRuntimeUnavailable(conversation.error) ? "warning" : "danger"} className="mb-4" title="The last turn did not complete">
                {conversation.error}
              </Alert>
            ) : null}

            {!threadId ? (
              <StarterPanel
                agentName={agent.name}
                role={profile?.roleLabel ?? ""}
                starters={starters}
                onPick={(text) => void newThread(text)}
                onNew={() => void newThread()}
                creating={creating}
              />
            ) : conversation.loading ? (
              <div className="flex justify-center py-16">
                <Spinner label="Loading conversation" />
              </div>
            ) : conversation.messages.length === 0 && !conversation.streaming ? (
              <StarterPanel
                agentName={agent.name}
                role={profile?.roleLabel ?? ""}
                starters={starters}
                onPick={(text) => void conversation.send(text)}
                creating={conversation.busy}
              />
            ) : (
              <MessageList messages={conversation.messages} streaming={conversation.streaming}>
                {conversation.pendingGate ? <GateCard gate={conversation.pendingGate} busy={conversation.busy} onDecide={(body) => void conversation.decide(body)} /> : null}
              </MessageList>
            )}
          </div>
        </div>

        <div className="border-t border-line bg-surface px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <Composer disabled={composerDisabled} busy={conversation.busy} placeholder={composerPlaceholder} onSend={(text) => void conversation.send(text)} onCancel={conversation.cancel} />
          </div>
        </div>
      </section>

      <InitialMessageSender threadId={threadId} busy={conversation.busy} loading={conversation.loading} send={conversation.send} />
    </div>
  );
}

function StarterPanel({
  agentName,
  role,
  starters,
  onPick,
  onNew,
  creating,
}: {
  agentName: string;
  role: string;
  starters: string[];
  onPick: (text: string) => void;
  onNew?: () => void;
  creating: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-neutral-soft text-ink-600">
          <ChatIcon className="size-5" />
        </span>
        <h2 className="mt-3 text-base font-semibold text-ink-900">Brief the {agentName}</h2>
        <p className="mt-1 text-sm text-ink-500">
          Signed in as {role}. The Orchestrator decides which agent to involve and pauses for your decision before anything is filed in Jira.
        </p>
      </div>
      {starters.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-2">
          {starters.map((s) => (
            <button
              key={s}
              type="button"
              disabled={creating}
              onClick={() => onPick(s)}
              className="rounded-lg border border-line bg-surface px-4 py-3 text-left text-sm text-ink-700 transition-colors hover:border-ink-400 hover:bg-ink-50 disabled:opacity-60"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {onNew ? (
        <div className="mt-6 text-center">
          <Button variant="primary" onClick={onNew} loading={creating}>
            Start a blank conversation
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// When a starter prompt creates a thread, the prompt travels in router state and is sent
// once the new conversation has loaded.
function InitialMessageSender({ threadId, busy, loading, send }: { threadId: string | null; busy: boolean; loading: boolean; send: (text: string) => Promise<void> }) {
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
