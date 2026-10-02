import type { PendingGate, RunStatus, StreamEvent } from "@/shared/api/types.ts";
import { applyProgressEvent, applyToolEvent } from "@/shared/lib/stream.ts";
import type { ChatMessage } from "../types.ts";

export interface LiveState {
  streaming: ChatMessage | null;
  pendingGate: PendingGate | null;
  runStatus: RunStatus | null;
  liveRunId: string | null;
  error: string | null;
}

let localId = 0;

export function newMessage(role: ChatMessage["role"], text = ""): ChatMessage {
  localId += 1;
  return { id: `local-${localId}`, role, text, tools: [], createdAt: new Date().toISOString() };
}

export function applyStreamEvent<S extends LiveState>(state: S, event: StreamEvent): S {
  const streaming = state.streaming ?? newMessage("assistant");
  switch (event.event) {
    case "run":
      return { ...state, streaming, liveRunId: event.data.runId, runStatus: event.data.status };
    case "text":
      return { ...state, streaming: { ...streaming, text: streaming.text + event.data.delta } };
    case "tool":
      return { ...state, streaming: { ...streaming, tools: applyToolEvent(streaming.tools, event.data) } };
    case "progress":
      return { ...state, streaming: { ...streaming, tools: applyProgressEvent(streaming.tools, event.data) } };
    case "gate":
      return { ...state, streaming, runStatus: "SUSPENDED_FOR_APPROVAL", pendingGate: { ...event.data, snapshotHash: null } };
    case "decision":
      return { ...state, pendingGate: null };
    case "error":
      return { ...state, error: event.data.message };
    case "done":
      return { ...state, runStatus: event.data.status };
  }
}

export function commitStreaming(messages: ChatMessage[], streaming: ChatMessage | null): ChatMessage[] {
  return streaming && (streaming.text || streaming.tools.length) ? [...messages, streaming] : messages;
}
