import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "../../../shared/ui/Button.tsx";
import { SendIcon } from "../../../shared/icons/index.tsx";

export function Composer({ disabled, busy, placeholder, onSend, onCancel }: { disabled: boolean; busy: boolean; placeholder: string; onSend: (text: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = value.trim();
    if (!text || disabled || busy) return;
    onSend(text);
    setValue("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line-strong bg-surface p-2 shadow-sm focus-within:border-ink-500 focus-within:ring-2 focus-within:ring-ink-200">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled || busy}
        placeholder={placeholder}
        className="scroll-quiet block w-full resize-none bg-transparent px-2 py-1.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none disabled:text-ink-500"
      />
      <div className="mt-1 flex items-center justify-between px-1">
        <p className="text-[11px] text-ink-400">Enter to send, Shift+Enter for a new line</p>
        {busy ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Stop watching
          </Button>
        ) : (
          <Button size="sm" variant="primary" type="submit" disabled={disabled || !value.trim()} icon={<SendIcon className="size-3.5" />}>
            Send
          </Button>
        )}
      </div>
    </form>
  );
}
