import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { paths } from "@/app/paths.ts";
import { useProfile } from "@/shared/auth/useAuth.ts";
import { GateDecisionCard } from "@/shared/components/GateDecisionCard.tsx";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { ChatIcon } from "@/shared/icons/index.tsx";
import { roleLabel } from "@/shared/lib/roles.ts";
import { Alert } from "@/shared/ui/Alert.tsx";
import { Button } from "@/shared/ui/Button.tsx";
import { EmptyState } from "@/shared/ui/EmptyState.tsx";
import { LoadingState } from "@/shared/ui/LoadingState.tsx";
import { Modal } from "@/shared/ui/Modal.tsx";
import { workspaceApi } from "./api.ts";
import { Composer } from "./components/Composer.tsx";
import { ConversationPane } from "./components/ConversationPane.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { StarterPanel } from "./components/StarterPanel.tsx";
import { ThreadList } from "./components/ThreadList.tsx";
import { WorkspaceHeader } from "./components/WorkspaceHeader.tsx";
import { useConversation } from "./hooks/useConversation.ts";
import { useThreads } from "./hooks/useThreads.ts";
import { starterInfo } from "./lib/starters.ts";
import { threadTitle } from "./lib/threads.ts";

const ENTRY_AGENT = "orchestrator";

export function WorkspacePage() {
  const me = useProfile();
  const { threadId = null } = useParams<{ threadId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [showThreads, setShowThreads] = useState(false);
  const [creating, setCreating] = useState(false);

  const agentsState = useAsync(() => workspaceApi.agents(), []);
  const agent = agentsState.data?.find((a) => a.id === ENTRY_AGENT && a.access === "run") ?? null;
  const threads = useThreads(agent ? agent.id : null);
  const conversation = useConversation(ENTRY_AGENT, threadId);
  const info = starterInfo(me.role, agent?.suggestedPrompts);

  const { upsert } = threads;
  useEffect(() => {
    if (conversation.thread) upsert(conversation.thread);
  }, [conversation.thread, upsert]);

  const initialMessage = (location.state as { initialMessage?: string } | null)?.initialMessage;
  const sentFor = useRef<string | null>(null);
  const { send, loading, busy } = conversation;
  useEffect(() => {
    if (!threadId || !initialMessage || loading || busy || sentFor.current === location.key) return;
    sentFor.current = location.key;
    navigate(location.pathname, { replace: true, state: null });
    void send(initialMessage);
  }, [threadId, initialMessage, loading, busy, location.key, location.pathname, navigate, send]);

  async function start(text: string) {
    if (threadId) {
      await send(text);
      return;
    }
    setCreating(true);
    const thread = await threads.create();
    setCreating(false);
    if (thread) navigate(paths.workspaceThread(thread.id), { state: { initialMessage: text } });
  }

  async function removeThread(id: string) {
    if ((await threads.remove(id)) && id === threadId) navigate(paths.workspace);
  }

  if (agentsState.data === null) {
    if (!agentsState.error) return <LoadingState label="Loading workspace" className="h-full items-center" />;
  }

  if (!agent) {
    return (
      <EmptyState
        className="h-full"
        icon={<ChatIcon className="size-5" />}
        title={agentsState.error ? "Could not load the agents" : "The Orchestrator is not available to your role"}
        description={agentsState.error ?? `${roleLabel(me.role)} has no run access to the Orchestrator.`}
        action={<Button onClick={() => void agentsState.reload()}>Try again</Button>}
      />
    );
  }

  const list = (
    <ThreadList
      threads={threads.threads}
      activeId={threadId}
      loading={threads.loading}
      onNew={() => {
        setShowThreads(false);
        navigate(paths.workspace);
      }}
      onRename={threads.rename}
      onDelete={removeThread}
      onOpen={() => setShowThreads(false)}
    />
  );
  const activeThread = threads.threads.find((t) => t.id === threadId) ?? conversation.thread;
  const empty = !threadId || (!conversation.loading && conversation.messages.length === 0 && !conversation.streaming && !conversation.pendingGate);

  return (
    <div className="flex h-full min-h-0 bg-surface-subtle">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-surface lg:block" aria-label="Conversations">
        {list}
      </aside>
      <Modal open={showThreads} onClose={() => setShowThreads(false)} title="Conversations">
        <div className="-mx-4 -my-4 h-[60vh] sm:-mx-5">{list}</div>
      </Modal>

      <section className="flex min-w-0 flex-1 flex-col" aria-label="Conversation">
        <WorkspaceHeader
          title={threadId ? threadTitle(activeThread) : agent.name}
          description={agent.description}
          busy={conversation.busy}
          runStatus={conversation.runStatus}
          runId={conversation.liveRunId ?? conversation.run?.id ?? null}
          onRename={threadId ? (title) => threads.rename(threadId, title) : null}
          onShowThreads={() => setShowThreads(true)}
        />
        <ConversationPane
          notices={
            <>
              {threads.error ? <Alert tone="danger">{threads.error}</Alert> : null}
              {conversation.error ? (
                <Alert tone="danger" title="Turn incomplete">
                  {conversation.error}
                </Alert>
              ) : null}
            </>
          }
          footer={
            <Composer
              disabled={creating || conversation.loading || Boolean(conversation.pendingGate)}
              busy={conversation.busy}
              stopping={conversation.stopping}
              placeholder={conversation.pendingGate ? "Answer the decision above to continue" : info.placeholder}
              onSend={(text) => void start(text)}
              onStop={() => void conversation.stop()}
            />
          }
        >
          {threadId && conversation.loading ? (
            <LoadingState label="Loading conversation" />
          ) : empty ? (
            <StarterPanel agentName={agent.name} role={roleLabel(me.role)} info={info} disabled={creating || conversation.busy} onPick={(text) => void start(text)} />
          ) : (
            <MessageList messages={conversation.messages} streaming={conversation.streaming}>
              {conversation.pendingGate ? <GateDecisionCard key={conversation.pendingGate.approvalId} gate={conversation.pendingGate} busy={conversation.busy} onDecide={(body) => void conversation.decide(body)} /> : null}
            </MessageList>
          )}
        </ConversationPane>
      </section>
    </div>
  );
}
