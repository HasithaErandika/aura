import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../../types/api.ts";
import { Markdown } from "../../../shared/ui/Markdown.tsx";
import { ToolActivity } from "./ToolActivity.tsx";
import { cn } from "../../../shared/lib/cn.ts";
import { formatDateTime } from "../../../shared/lib/format.ts";
import { PersonIcon, AgentLiveIcon } from "../../../shared/icons/index.tsx";

function Bubble({ message, live }: { message: ChatMessage; live?: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium shadow-xs",
          isUser
            ? "bg-ink-900 text-on-dark"
            : "border border-line bg-surface text-ink-700",
        )}
      >
        {isUser ? <PersonIcon className="size-4" /> : <AgentLiveIcon running={Boolean(live)} size={20} />}
      </div>

      <div className={cn("max-w-[min(48rem,88%)] space-y-2", isUser ? "items-end" : "items-start")}>
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
              "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs transition-colors",
              isUser
                ? "bg-ink-900 text-on-dark rounded-tr-xs"
                : "border border-line bg-surface text-ink-900 rounded-tl-xs",
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.text}</p>
            ) : message.text ? (
              <Markdown source={message.text} />
            ) : (
              <div className="flex items-center gap-2 text-ink-500 py-1">
                <AgentLiveIcon running size={20} />
                <span className="text-xs font-medium tracking-wide">Agent is thinking...</span>
              </div>
            )}
          </div>
        ) : null}

        {message.createdAt && !live ? (
          <p className={cn("px-1 text-[10px] font-medium text-ink-400", isUser ? "text-right" : "text-left")}>
            {formatDateTime(message.createdAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  streaming,
  children,
}: {
  messages: ChatMessage[];
  streaming: ChatMessage | null;
  children?: React.ReactNode;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (frame.current !== null) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      endRef.current?.scrollIntoView({ block: "end" });
    });
  }, [messages.length, streaming?.text.length, streaming?.tools.length, children]);

  useEffect(
    () => () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <div className="space-y-6">
      {messages.map((m) => (
        <Bubble key={m.id} message={m} />
      ))}
      {streaming ? <Bubble message={streaming} live /> : null}
      {children}
      <div ref={endRef} />
    </div>
  );
}
