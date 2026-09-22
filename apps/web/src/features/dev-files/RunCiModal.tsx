import { useEffect, useRef, useState } from "react";
import { describeError } from "../../shared/api/errors.ts";
import { workspaceApi } from "../workspace/api.ts";
import { useConversation } from "../workspace/hooks/useConversation.ts";
import { GateCard } from "../workspace/components/GateCard.tsx";
import { ToolActivity } from "../workspace/components/ToolActivity.tsx";
import { Modal } from "../../shared/ui/Modal.tsx";
import { Alert } from "../../shared/ui/Alert.tsx";
import { Spinner } from "../../shared/ui/Spinner.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";

// Runs delegate_to_ci inline, without leaving the page it was triggered from - creates a
// throwaway Orchestrator thread, sends the fixed "Run CI for ..." message, and renders the same
// tool-activity/gate primitives the Workspace chat uses (GateCard, ToolActivity), just embedded
// in a modal instead of a full conversation view. If CI fails, the resulting "File a defect?"
// gate renders here too, so filing one never requires switching pages either.
export function RunCiModal({ epicKey, discipline, onClose }: { epicKey: string; discipline: "Frontend" | "Backend"; onClose: () => void }) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const startedSend = useRef(false);
  const conversation = useConversation("orchestrator", threadId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const thread = await workspaceApi.createThread("orchestrator");
        if (!cancelled) setThreadId(thread.id);
      } catch (err) {
        if (!cancelled) setCreateError(describeError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs exactly once, when the modal mounts.
  }, []);

  useEffect(() => {
    if (!threadId || startedSend.current) return;
    startedSend.current = true;
    void conversation.send(`Run CI for the ${discipline} project under Epic ${epicKey}.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const finished = conversation.runStatus === "SUCCEEDED" || conversation.runStatus === "FAILED";
  const running = Boolean(threadId) && !finished && !createError;
  const streamingText = conversation.streaming?.text ?? conversation.messages.at(-1)?.text ?? "";
  const tools = conversation.streaming?.tools ?? conversation.messages.at(-1)?.tools ?? [];

  return (
    <Modal open onClose={onClose} title={`Run CI - ${discipline}`} description={epicKey} widthClassName="max-w-xl">
      <div className="space-y-3">
        {createError ? <Alert tone="danger">{createError}</Alert> : null}
        {conversation.error ? <Alert tone="danger">{conversation.error}</Alert> : null}

        {running ? (
          <div className="flex items-center gap-2 text-sm text-ink-600">
            <Spinner size="sm" />
            Running - this can take a few minutes (install, build, Playwright).
          </div>
        ) : finished ? (
          <Badge tone={conversation.runStatus === "SUCCEEDED" ? "success" : "danger"}>{conversation.runStatus === "SUCCEEDED" ? "Finished" : "Failed"}</Badge>
        ) : null}

        {tools.length > 0 ? (
          <div className="space-y-1.5">
            {tools.map((t) => (
              <ToolActivity key={t.toolCallId ?? t.toolName} tool={t} />
            ))}
          </div>
        ) : null}

        {streamingText ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{streamingText}</p> : null}

        {conversation.pendingGate ? <GateCard gate={conversation.pendingGate} busy={conversation.busy} onDecide={(body) => void conversation.decide(body)} compact /> : null}
      </div>
    </Modal>
  );
}
