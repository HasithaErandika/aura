import { useCallback, useEffect, useRef, useState } from "react";
import { describeError } from "@/shared/api/errors.ts";
import { turnsApi } from "@/shared/api/turns.ts";
import type { DecisionInput, Run, StreamEvent } from "@/shared/api/types.ts";
import { usePolling } from "@/shared/hooks/usePolling.ts";
import { toPendingGate } from "@/shared/lib/approvals.ts";
import { isRunStreaming } from "@/shared/lib/status.ts";
import { workspaceApi } from "../api.ts";
import { applyStreamEvent, commitStreaming, newMessage, type LiveState } from "../lib/conversation.ts";
import type { ChatMessage, Thread } from "../types.ts";

export interface ConversationState extends LiveState {
  threadId: string | null;
  messages: ChatMessage[];
  run: Run | null;
  thread: Thread | null;
  busy: boolean;
  stopping: boolean;
  loading: boolean;
}

function freshState(threadId: string | null): ConversationState {
  return { threadId, messages: [], streaming: null, pendingGate: null, run: null, runStatus: null, liveRunId: null, thread: null, busy: false, stopping: false, loading: Boolean(threadId), error: null };
}

export function useConversation(agentId: string, threadId: string | null) {
  const [state, setState] = useState<ConversationState>(() => freshState(threadId));
  if (state.threadId !== threadId) setState(freshState(threadId));

  const current = useRef(threadId);
  const busyRef = useRef(false);
  const turn = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pendingText = useRef("");
  const frame = useRef<number | null>(null);

  useEffect(() => {
    current.current = threadId;
    return () => {
      abortRef.current?.abort();
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
      pendingText.current = "";
      busyRef.current = false;
    };
  }, [threadId]);

  const update = useCallback((forThread: string | null, fn: (s: ConversationState) => ConversationState) => {
    if (current.current !== forThread) return;
    setState((s) => (s.threadId === forThread ? fn(s) : s));
  }, []);

  const flushText = useCallback(
    (forThread: string | null) => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
      const delta = pendingText.current;
      pendingText.current = "";
      if (delta) update(forThread, (s) => applyStreamEvent(s, { event: "text", data: { delta } }));
    },
    [update],
  );

  const listener = useCallback(
    (forThread: string | null) => (event: StreamEvent) => {
      if (event.event === "text") {
        pendingText.current += event.data.delta;
        if (frame.current === null) frame.current = window.requestAnimationFrame(() => flushText(forThread));
        return;
      }
      flushText(forThread);
      update(forThread, (s) => applyStreamEvent(s, event));
    },
    [flushText, update],
  );

  const load = useCallback(async () => {
    const forThread = threadId;
    if (!forThread) return;
    try {
      const history = await workspaceApi.history(agentId, forThread);
      update(forThread, (s) => ({
        ...s,
        messages: s.busy ? s.messages : history.messages,
        pendingGate: history.pendingApproval ? toPendingGate(history.pendingApproval) : s.busy ? s.pendingGate : null,
        run: history.latestRun,
        runStatus: s.busy ? s.runStatus : (history.latestRun?.status ?? null),
        thread: history.thread,
        loading: false,
      }));
    } catch (err) {
      update(forThread, (s) => ({ ...s, loading: false, error: describeError(err) }));
    }
  }, [agentId, threadId, update]);

  useEffect(() => {
    void load();
  }, [load]);

  const finishTurn = useCallback(
    async (forThread: string | null) => {
      flushText(forThread);
      if (current.current === forThread) busyRef.current = false;
      update(forThread, (s) => ({ ...s, messages: commitStreaming(s.messages, s.streaming), streaming: null, busy: false, stopping: false }));
      await load();
    },
    [flushText, update, load],
  );

  const runTurn = useCallback(
    async (start: (signal: AbortSignal, onEvent: (e: StreamEvent) => void) => Promise<void>, before?: (s: ConversationState) => ConversationState) => {
      const forThread = threadId;
      const token = ++turn.current;
      const controller = new AbortController();
      abortRef.current = controller;
      busyRef.current = true;
      update(forThread, (s) => ({ ...(before ? before(s) : s), busy: true, stopping: false, error: null, streaming: null, liveRunId: null }));
      try {
        await start(controller.signal, listener(forThread));
      } catch (err) {
        if (!controller.signal.aborted) update(forThread, (s) => ({ ...s, error: describeError(err) }));
      } finally {
        if (turn.current === token) await finishTurn(forThread);
      }
    },
    [threadId, update, listener, finishTurn],
  );

  const send = useCallback(
    async (message: string) => {
      if (!threadId || busyRef.current) return;
      await runTurn(
        (signal, onEvent) => turnsApi.send(agentId, threadId, message, onEvent, signal),
        (s) => ({ ...s, messages: [...s.messages, newMessage("user", message)] }),
      );
    },
    [agentId, threadId, runTurn],
  );

  const decide = useCallback(
    async (body: DecisionInput) => {
      const gate = state.pendingGate;
      if (!gate || busyRef.current) return;
      await runTurn((signal, onEvent) => turnsApi.decide(gate.approvalId, { ...body, snapshotHash: gate.snapshotHash ?? undefined }, onEvent, signal));
    },
    [state.pendingGate, runTurn],
  );

  const stop = useCallback(async () => {
    const runId = state.liveRunId ?? (state.run && isRunStreaming(state.run.status) ? state.run.id : null);
    if (!runId) {
      abortRef.current?.abort();
      return;
    }
    const forThread = threadId;
    update(forThread, (s) => ({ ...s, stopping: true }));
    try {
      await turnsApi.stop(runId);
    } catch (err) {
      update(forThread, (s) => ({ ...s, stopping: false, error: describeError(err) }));
    }
  }, [state.liveRunId, state.run, threadId, update]);

  const followId = state.run && isRunStreaming(state.run.status) ? state.run.id : null;
  useEffect(() => {
    if (!followId || busyRef.current) return;
    void runTurn((signal, onEvent) => turnsApi.follow(followId, onEvent, signal));
  }, [followId, runTurn]);

  const waitingOnOthers = Boolean(state.pendingGate && !state.pendingGate.canDecide && !state.busy);
  usePolling(load, 6000, waitingOnOthers);

  return { ...state, send, decide, stop, reload: load };
}
