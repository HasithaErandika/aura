import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SendIcon } from "@/shared/icons/index.tsx";
import { Button } from "@/shared/ui/Button.tsx";

interface ComposerProps {
  disabled: boolean;
  busy: boolean;
  stopping: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ disabled, busy, stopping, placeholder, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = value.trim();
    if (!text || disabled || busy) return;
    onSend(text);
    setValue("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line-strong bg-surface p-3 shadow-xs focus-within:border-ink-500 focus-within:ring-2 focus-within:ring-ink-200">
      <label htmlFor="composer" className="sr-only">
        Message
      </label>
      <textarea
        id="composer"
        ref={ref}
        rows={1}
        maxLength={20000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className="scroll-quiet block w-full resize-none bg-transparent px-1 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none disabled:text-ink-400"
      />
      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-line/60 px-1 pt-2">
        <p className="hidden text-[11px] text-ink-400 sm:block">Enter to send, Shift+Enter for a new line</p>
        {busy ? (
          <Button size="sm" variant="danger" onClick={onStop} loading={stopping} className="ml-auto">
            Stop
          </Button>
        ) : (
          <Button size="sm" variant="primary" type="submit" disabled={disabled || !value.trim()} icon={<SendIcon className="size-3.5" />} className="ml-auto">
            Send
          </Button>
        )}
      </div>
    </form>
  );
}
