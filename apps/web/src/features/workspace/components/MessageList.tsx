import { useEffect, useRef, type ReactNode } from "react";
import type { ChatMessage } from "../types.ts";
import { MessageBubble } from "./MessageBubble.tsx";

export function MessageList({ messages, streaming, children }: { messages: ChatMessage[]; streaming: ChatMessage | null; children?: ReactNode }) {
  const endRef = useRef<HTMLDivElement>(null);
  const textLength = streaming?.text.length ?? 0;
  const toolCount = streaming?.tools.length ?? 0;

  useEffect(() => {
    const id = window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    return () => window.cancelAnimationFrame(id);
  }, [messages.length, textLength, toolCount, children]);

  return (
    <div className="space-y-6" aria-live="polite" aria-busy={Boolean(streaming)}>
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {streaming ? <MessageBubble message={streaming} live /> : null}
      {children}
      <div ref={endRef} />
    </div>
  );
}
