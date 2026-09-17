import { useCallback, useEffect, useRef, useState } from "react";
import { describeError } from "../../../shared/api/errors.ts";
import { usePolling } from "../../../shared/hooks/usePolling.ts";
import type { Approval, ChatMessage, ChatToolActivity, Decision, Run, RunStatus, StreamEvent } from "../../../types/api.ts";
import { workspaceApi } from "../api.ts";

export interface PendingGate {
  approvalId: string;
  runId: string;
  producingAgent: string | null;
  gate: { number: number; name: string; outcome: string } | null;
  requiredRole: string | null;
  question: string;
  options: Array<{ label: string; value?: string; description?: string }>;
  selectionMode: "single_select" | "multi_select" | null;
  snapshot: string | null;
  snapshotHash: string | null;
  expiresAt: string;
  canDecide: boolean;
}

export interface ConversationState {
  messages: ChatMessage[];
  streaming: ChatMessage | null;
  pendingGate: PendingGate | null;
  run: Run | null;
  runStatus: RunStatus | null;
  busy: boolean;
  loading: boolean;
  error: string | null;
}

function gateFromApproval(a: Approval): PendingGate {
  return {
    approvalId: a.id,
    runId: a.runId,
    producingAgent: a.producingAgent,
    gate: a.gate,
    requiredRole: a.requiredRole,
    question: a.question,
    options: a.options,
    selectionMode: a.selectionMode,
    snapshot: a.snapshot,
    snapshotHash: a.snapshotHash,
    expiresAt: a.expiresAt,
    canDecide: Boolean(a.canDecide),
  };
}

let localId = 0;
const nextId = () => `local-${++localId}`;

// Owns one conversation: history from the API, the live turn from the SSE stream, and the
// pending human gate. When the gate belongs to another role, it polls until that person
// decides so the requester sees the continuation.
export function useConversation(agentId: string, threadId: string | null) {
  const [state, setState] = useState<ConversationState>({
    messages: [],
    streaming: null,
    pendingGate: null,
    run: null,
    runStatus: null,
    busy: false,
    loading: Boolean(threadId),
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const pendingText = useRef("");
  const flushHandle = useRef<number | null>(null);

  const flushText = useCallback(() => {
    flushHandle.current = null;
    const delta = pendingText.current;
    if (!delta) return;
    pendingText.current = "";
    setState((s) => {
      const streaming: ChatMessage = s.streaming ?? { id: nextId(), role: "assistant", text: "", tools: [], createdAt: new Date().toISOString() };
      return { ...s, streaming: { ...streaming, text: streaming.text + delta } };
    });
  }, []);

  const queueText = useCallback(
    (delta: string) => {
      pendingText.current += delta;
      if (flushHandle.current === null) flushHandle.current = window.requestAnimationFrame(flushText);
    },
    [flushText],
  );

  const load = useCallback(
    async (silent = false) => {
      if (!threadId) {
        setState((s) => ({ ...s, messages: [], streaming: null, pendingGate: null, run: null, runStatus: null, loading: false, error: null }));
        return;
      }
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const history = await workspaceApi.history(agentId, threadId);
        setState((s) => ({
          ...s,
          messages: history.messages,
          streaming: s.busy ? s.streaming : null,
          pendingGate: history.pendingApproval ? gateFromApproval(history.pendingApproval) : null,
          run: history.latestRun,
          runStatus: history.latestRun?.status ?? null,
          loading: false,
          error: null,
        }));
      } catch (err) {
        setState((s) => ({ ...s, loading: false, error: describeError(err) }));
      }
    },
    [agentId, threadId],
  );

  useEffect(() => {
    abortRef.current?.abort();
    void load();
  }, [load]);

  const waitingOnSomeoneElse = Boolean(state.pendingGate && !state.pendingGate.canDecide && !state.busy);
  usePolling(() => load(true), 6000, waitingOnSomeoneElse);

  const applyEvent = useCallback((event: StreamEvent) => {
    if (event.event === "text") {
      queueText(event.data.delta);
      return;
    }
    // Any non-text event must see the text that preceded it in order.
    if (pendingText.current) {
      if (flushHandle.current !== null) window.cancelAnimationFrame(flushHandle.current);
      flushText();
    }
    setState((s) => {
      const streaming: ChatMessage = s.streaming ?? { id: nextId(), role: "assistant", text: "", tools: [], createdAt: new Date().toISOString() };
      switch (event.event) {
        case "run":
          return { ...s, streaming, runStatus: event.data.status };
        case "tool": {
          const { phase, toolName, toolCallId, args, result, error } = event.data;
          const tools = [...streaming.tools];
          const idx = tools.findIndex((t) => t.toolCallId === toolCallId && toolCallId);
          const next: ChatToolActivity =
            phase === "call"
              ? { toolCallId, toolName, state: "call", args }
              : phase === "result"
                ? { ...(idx >= 0 ? tools[idx]! : { toolCallId, toolName, args: undefined }), state: "result", result }
                : { ...(idx >= 0 ? tools[idx]! : { toolCallId, toolName, args: undefined }), state: "error", result: error, isError: true };
          if (idx >= 0) tools[idx] = next;
          else tools.push(next);
          return { ...s, streaming: { ...streaming, tools } };
        }
        case "gate":
          return {
            ...s,
            streaming,
            runStatus: "SUSPENDED_FOR_APPROVAL",
            pendingGate: { ...event.data, snapshotHash: null },
          };
        case "decision":
          return { ...s, pendingGate: null };
        case "error":
          return { ...s, error: event.data.message, runStatus: "FAILED" };
        case "done":
          return { ...s, runStatus: event.data.status };
        default:
          return s;
      }
    });
  }, [queueText, flushText]);

  const finishTurn = useCallback(() => {
    if (flushHandle.current !== null) window.cancelAnimationFrame(flushHandle.current);
    flushText();
    setState((s) => {
      const messages = s.streaming && (s.streaming.text || s.streaming.tools.length) ? [...s.messages, s.streaming] : s.messages;
      return { ...s, messages, streaming: null, busy: false };
    });
  }, [flushText]);

  const send = useCallback(
    async (message: string) => {
      if (!threadId) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setState((s) => ({
        ...s,
        busy: true,
        error: null,
        messages: [...s.messages, { id: nextId(), role: "user", text: message, tools: [], createdAt: new Date().toISOString() }],
        streaming: null,
      }));
      try {
        await workspaceApi.send(agentId, threadId, message, applyEvent, controller.signal);
      } catch (err) {
        if (!controller.signal.aborted) setState((s) => ({ ...s, error: describeError(err) }));
      } finally {
        finishTurn();
        void load(true);
      }
    },
    [agentId, threadId, applyEvent, finishTurn, load],
  );

  const decide = useCallback(
    async (body: { decision: Decision; answer?: string; reason?: string }) => {
      const gate = state.pendingGate;
      if (!gate) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setState((s) => ({ ...s, busy: true, error: null, streaming: null }));
      try {
        await workspaceApi.decide(
          gate.approvalId,
          { ...body, snapshotHash: gate.snapshotHash ?? undefined },
          applyEvent,
          controller.signal,
        );
      } catch (err) {
        if (!controller.signal.aborted) setState((s) => ({ ...s, error: describeError(err) }));
      } finally {
        finishTurn();
        void load(true);
      }
    },
    [state.pendingGate, applyEvent, finishTurn, load],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { ...state, send, decide, reload: () => load(true), cancel };
}
