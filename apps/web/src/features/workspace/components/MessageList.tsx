import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../../types/api.ts";
import { Markdown } from "../../../shared/ui/Markdown.tsx";
import { ToolActivity } from "./ToolActivity.tsx";
import { cn } from "../../../shared/lib/cn.ts";
import { formatDateTime } from "../../../shared/lib/format.ts";
import { ThinkingIcon } from "../../../shared/icons/index.tsx";

function Bubble({ message, live }: { message: ChatMessage; live?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[min(48rem,92%)] space-y-2", isUser ? "items-end" : "items-start")}>
        {message.tools.length > 0 ? (
          <div className="space-y-1.5">
            {message.tools.map((tool, i) => (
              <ToolActivity key={`${tool.toolCallId || i}`} tool={tool} />
            ))}
          </div>
        ) : null}
        {message.text || (live && message.tools.length === 0) ? (
          <div
            className={cn(
              "rounded-xl px-4 py-3 text-sm",
              isUser ? "bg-ink-900 text-on-dark" : "border border-line bg-surface text-ink-800",
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.text}</p>
            ) : message.text ? (
              <Markdown source={message.text} />
            ) : (
              <div className="flex items-center gap-2 text-ink-400">
                <ThinkingIcon className="size-5" />
                <span className="text-xs font-medium">Thinking</span>
              </div>
            )}
          </div>
        ) : null}
        {message.createdAt && !live ? (
          <p className={cn("px-1 text-[11px] text-ink-400", isUser ? "text-right" : "text-left")}>{formatDateTime(message.createdAt)}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MessageList({ messages, streaming, children }: { messages: ChatMessage[]; streaming: ChatMessage | null; children?: React.ReactNode }) {
  const endRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      endRef.current?.scrollIntoView({ block: "end" });
    });
  }, [messages.length, streaming?.text.length, streaming?.tools.length, children]);
  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
  }, []);

  return (
    <div className="space-y-5">
      {messages.map((m) => (
        <Bubble key={m.id} message={m} />
      ))}
      {streaming ? <Bubble message={streaming} live /> : null}
      {children}
      <div ref={endRef} />
    </div>
  );
}
