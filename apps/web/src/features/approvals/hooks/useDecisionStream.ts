import { useCallback, useEffect, useRef, useState } from "react";
import { describeError } from "@/shared/api/errors.ts";
import { turnsApi } from "@/shared/api/turns.ts";
import type { DecisionInput, RunStatus, StreamEvent, ToolActivityItem } from "@/shared/api/types.ts";
import { applyProgressEvent, applyToolEvent } from "@/shared/lib/stream.ts";

export interface Continuation {
  text: string;
  tools: ToolActivityItem[];
  status: RunStatus | null;
  nextApprovalId: string | null;
  error: string | null;
}

const EMPTY: Continuation = { text: "", tools: [], status: null, nextApprovalId: null, error: null };

function reduce(cur: Continuation, event: StreamEvent): Continuation {
  switch (event.event) {
    case "text":
      return { ...cur, text: cur.text + event.data.delta };
    case "tool":
      return { ...cur, tools: applyToolEvent(cur.tools, event.data) };
    case "progress":
      return { ...cur, tools: applyProgressEvent(cur.tools, event.data) };
    case "gate":
      return { ...cur, nextApprovalId: event.data.approvalId, status: "SUSPENDED_FOR_APPROVAL" };
    case "error":
      return { ...cur, error: event.data.message };
    case "done":
      return { ...cur, status: event.data.status, nextApprovalId: event.data.approvalId ?? cur.nextApprovalId };
    default:
      return cur;
  }
}

export function useDecisionStream(onFinished: () => void) {
  const [busy, setBusy] = useState(false);
  const [continuation, setContinuation] = useState<Continuation | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const decide = useCallback(
    async (approvalId: string, snapshotHash: string, body: DecisionInput) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setContinuation(EMPTY);
      try {
        await turnsApi.decide(approvalId, { ...body, snapshotHash }, (event) => setContinuation((c) => reduce(c ?? EMPTY, event)), controller.signal);
      } catch (err) {
        if (!controller.signal.aborted) setContinuation((c) => ({ ...(c ?? EMPTY), error: describeError(err) }));
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          onFinished();
        }
      }
    },
    [onFinished],
  );

  return { busy, continuation, decide };
}
