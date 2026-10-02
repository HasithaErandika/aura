import type { AskUserOption, ChatMessage, TurnEvent } from "@aura/client";
import { applyTaskEvent, type TaskBoard } from "../task-board.js";

// What the chat panel shows: the conversation from history plus the live turn, built from the
// API's turn events. Pure (no VS Code), so it is tested directly; view.ts renders it.

export type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "tool"; id: string; name: string; detail: string; state: "running" | "done" | "error"; result?: string }
  | { kind: "notice"; id: string; tone: "info" | "error"; text: string }
  | { kind: "gate"; id: string; approvalId: string; title: string; question: string; options: AskUserOption[]; canDecide: boolean; decided: string | null }
  | { kind: "note"; id: string; text: string };

export interface ChatState {
  items: ChatItem[];
  busy: boolean;
  // Stop was pressed and the turn hasn't ended yet.
  stopping: boolean;
  // The latest run: the one streaming now, or the last one (for Open Run in Web).
  runId: string | null;
  title: string | null;
  // The Task in this conversation (Plan and Review views).
  task: TaskBoard | null;
}

export const emptyChat = (title: string | null = null, task: TaskBoard | null = null): ChatState => ({ items: [], busy: false, stopping: false, runId: null, title, task });

// Mastra workspace tool ids → short names the developer recognises.
export function toolLabel(toolName: string): string {
  return toolName.replace(/^mastra_workspace_/, "").replace(/_/g, " ");
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// The one line shown next to a tool call: the file or the command.
export function toolDetail(args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  if (str(a.command)) return [str(a.command), ...((Array.isArray(a.args) ? a.args : []) as unknown[]).map(String)].join(" ").slice(0, 200);
  return str(a.path) || str(a.pattern) || str(a.query) || "";
}

function resultText(result: unknown): string {
  if (typeof result === "string") return result.slice(0, 2000);
  if (result === undefined || result === null) return "";
  const text = JSON.stringify(result);
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
}

let seq = 0;
const nextId = () => `live-${++seq}`;

export function fromHistory(messages: ChatMessage[], title: string | null = null, runId: string | null = null, task: TaskBoard | null = null): ChatState {
  const items: ChatItem[] = [];
  for (const m of messages) {
    if (m.role === "user" && m.text.trim()) items.push({ kind: "user", id: m.id, text: m.text });
    if (m.role === "assistant") {
      for (const t of m.tools) {
        items.push({ kind: "tool", id: `${m.id}-${t.toolCallId}`, name: toolLabel(t.toolName), detail: toolDetail(t.args), state: t.isError ? "error" : "done", result: resultText(t.result) });
      }
      if (m.text.trim()) items.push({ kind: "assistant", id: m.id, text: m.text });
    }
  }
  return { items, busy: false, stopping: false, runId, title, task };
}

export function markStopping(state: ChatState): ChatState {
  return state.busy ? { ...state, stopping: true } : state;
}

// A note typed while the Task runs: shown in the conversation, read by the coders at their next step.
export function addNote(state: ChatState, text: string): ChatState {
  return { ...state, items: [...state.items, { kind: "note", id: nextId(), text }] };
}

export function markDecided(state: ChatState, approvalId: string, decision: string): ChatState {
  return { ...state, items: state.items.map((i) => (i.kind === "gate" && i.approvalId === approvalId ? { ...i, decided: decision } : i)) };
}

export function addUserMessage(state: ChatState, text: string): ChatState {
  return { ...state, busy: true, items: [...state.items, { kind: "user", id: nextId(), text }] };
}

export function applyEvent(state: ChatState, e: TurnEvent): ChatState {
  const items = [...state.items];
  const last = items[items.length - 1];
  switch (e.event) {
    case "run":
      return { ...state, busy: true, stopping: false, runId: e.data.runId };
    case "text": {
      if (last?.kind === "assistant" && last.id.startsWith("live-")) items[items.length - 1] = { ...last, text: last.text + e.data.delta };
      else items.push({ kind: "assistant", id: nextId(), text: e.data.delta });
      return { ...state, items };
    }
    case "tool": {
      const id = `tool-${e.data.toolCallId}`;
      const index = items.findIndex((i) => i.id === id);
      if (e.data.phase === "call") {
        if (index === -1) items.push({ kind: "tool", id, name: toolLabel(e.data.toolName), detail: toolDetail(e.data.args), state: "running" });
      } else if (index !== -1) {
        const existing = items[index] as Extract<ChatItem, { kind: "tool" }>;
        items[index] = { ...existing, state: e.data.phase === "error" ? "error" : "done", result: e.data.phase === "error" ? str(e.data.error) : resultText(e.data.result) };
      }
      return { ...state, items };
    }
    case "gate":
      items.push({
        kind: "gate",
        id: `gate-${e.data.approvalId}`,
        approvalId: e.data.approvalId,
        title: e.data.gate ? (e.data.gate.number === null ? e.data.gate.name : `Gate ${e.data.gate.number}: ${e.data.gate.name}`) : "Your decision",
        question: e.data.question,
        options: e.data.options,
        canDecide: e.data.canDecide,
        decided: null,
      });
      return { ...state, items };
    case "decision":
      return markDecided(state, e.data.approvalId, e.data.decision);
    case "progress":
      return e.data.source === "task" ? { ...state, task: applyTaskEvent(state.task, e.data as Record<string, unknown>) } : state;
    case "error":
      items.push({ kind: "notice", id: nextId(), tone: "error", text: e.data.message });
      return { ...state, items };
    case "done": {
      const settled = items.map((i) => (i.kind === "tool" && i.state === "running" ? { ...i, state: "error" as const, result: "No result (the turn ended)" } : i));
      const explained = settled.at(-1)?.kind === "notice";
      if ((e.data.status === "INTERRUPTED" || e.data.status === "FAILED") && !explained) settled.push({ kind: "notice", id: nextId(), tone: "error", text: `The turn ended: ${e.data.status.toLowerCase()}.` });
      return { ...state, items: settled, busy: false, stopping: false };
    }
    default:
      return state;
  }
}
