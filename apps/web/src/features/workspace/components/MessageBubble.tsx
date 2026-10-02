import { ToolActivity } from "@/shared/components/ToolActivity.tsx";
import { AgentLiveIcon, PersonIcon } from "@/shared/icons/index.tsx";
import { cn } from "@/shared/lib/cn.ts";
import { formatDateTime } from "@/shared/lib/format.ts";
import { Markdown } from "@/shared/ui/Markdown.tsx";
import type { ChatMessage } from "../types.ts";

export function MessageBubble({ message, live = false }: { message: ChatMessage; live?: boolean }) {
  const isUser = message.role === "user";
  const thinking = live && !message.text && message.tools.length === 0;

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", isUser ? "bg-ink-900 text-on-dark" : "border border-line bg-surface")} aria-hidden>
        {isUser ? <PersonIcon className="size-4" /> : <AgentLiveIcon running={live} size={20} />}
      </div>
      <div className={cn("min-w-0 max-w-[min(48rem,85%)] space-y-2", isUser && "flex flex-col items-end")}>
        <span className="sr-only">{isUser ? "You said" : "Agent said"}</span>
        {message.tools.length > 0 ? (
          <div className="space-y-1.5">
            {message.tools.map((tool, i) => (
              <ToolActivity key={tool.toolCallId || i} tool={tool} />
            ))}
          </div>
        ) : null}
        {message.text || thinking ? (
          <div className={cn("rounded-2xl px-4 py-3 text-sm leading-relaxed break-words", isUser ? "rounded-tr-sm bg-ink-900 text-on-dark" : "rounded-tl-sm border border-line bg-surface text-ink-900")}>
            {isUser ? <p className="whitespace-pre-wrap">{message.text}</p> : thinking ? <p className="text-xs font-medium text-ink-500">Thinking...</p> : <Markdown source={message.text} />}
          </div>
        ) : null}
        {message.createdAt && !live ? <p className="px-1 text-[10px] font-medium text-ink-400">{formatDateTime(message.createdAt)}</p> : null}
      </div>
    </div>
  );
}
