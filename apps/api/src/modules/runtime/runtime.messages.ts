// Normalizes Mastra's stored message format into the compact shape the web renders. The
// runtime stores MastraDBMessage rows whose `content.parts` mix text and tool invocations.

export interface ChatToolActivity {
  toolCallId: string;
  toolName: string;
  state: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  tools: ChatToolActivity[];
  createdAt: string | null;
}

interface RawPart {
  type?: string;
  text?: string;
  toolInvocation?: {
    toolCallId?: string;
    toolName?: string;
    state?: string;
    args?: unknown;
    result?: unknown;
    isError?: boolean;
  };
  // AI SDK v5 style tool parts: type "tool-<name>"
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

interface RawMessage {
  id?: string;
  role?: string;
  createdAt?: string | Date;
  content?: string | { parts?: RawPart[]; content?: string } | RawPart[];
}

function asRole(role: unknown): ChatMessage["role"] {
  return role === "user" || role === "assistant" || role === "system" || role === "tool" ? role : "assistant";
}

export function normalizeMessages(raw: unknown[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const item of raw) {
    const message = item as RawMessage;
    const role = asRole(message.role);
    const textParts: string[] = [];
    const tools: ChatToolActivity[] = [];

    const content = message.content;
    if (typeof content === "string") {
      textParts.push(content);
    } else if (Array.isArray(content)) {
      collectParts(content, textParts, tools);
    } else if (content && typeof content === "object") {
      if (Array.isArray(content.parts)) collectParts(content.parts, textParts, tools);
      else if (typeof content.content === "string") textParts.push(content.content);
    }

    const text = textParts.join("").trim();
    if (!text && tools.length === 0) continue;
    if (role === "system") continue;

    out.push({
      id: message.id ?? `${out.length}`,
      role,
      text,
      tools,
      createdAt: message.createdAt ? new Date(message.createdAt).toISOString() : null,
    });
  }
  return out;
}

function collectParts(parts: RawPart[], textParts: string[], tools: ChatToolActivity[]) {
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") {
      textParts.push(part.text);
      continue;
    }
    if (part.type === "tool-invocation" && part.toolInvocation) {
      const inv = part.toolInvocation;
      tools.push({
        toolCallId: inv.toolCallId ?? "",
        toolName: inv.toolName ?? "tool",
        state: inv.state ?? "unknown",
        args: inv.args,
        result: inv.result,
        isError: inv.isError,
      });
      continue;
    }
    if (typeof part.type === "string" && part.type.startsWith("tool-") && part.type !== "tool-invocation") {
      tools.push({
        toolCallId: part.toolCallId ?? "",
        toolName: part.type.slice(5),
        state: part.state ?? "unknown",
        args: part.input,
        result: part.output,
      });
    }
  }
}
