import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "../../../shared/ui/Button.tsx";
import { SendIcon, SparkleIcon } from "../../../shared/icons/index.tsx";

export function Composer({
  disabled,
  busy,
  placeholder,
  onSend,
  onCancel,
}: {
  disabled: boolean;
  busy: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  onCancel: () => void;
}) {
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={submit}
      className="relative rounded-2xl border border-line-strong bg-surface p-3 shadow-xs transition-all duration-200 focus-within:border-ink-600 focus-within:ring-2 focus-within:ring-ink-500/10 focus-within:shadow-sm"
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled || busy}
        placeholder={placeholder}
        className="scroll-quiet block w-full resize-none bg-transparent px-1 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none disabled:text-ink-400 disabled:placeholder:text-ink-300"
      />
      <div className="mt-2.5 flex items-center justify-between border-t border-line/50 pt-2 px-1">
        <div className="flex items-center gap-1.5 text-[11px] text-ink-400 font-medium">
          <SparkleIcon className="size-3 text-ink-400" />
          <span>Press <kbd className="rounded border border-line px-1 py-0.5 text-[10px] font-sans bg-surface-subtle">Enter</kbd> to send, <kbd className="rounded border border-line px-1 py-0.5 text-[10px] font-sans bg-surface-subtle">Shift+Enter</kbd> for line break</span>
        </div>
        {busy ? (
          <Button size="sm" variant="secondary" onClick={onCancel} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200">
            Stop Generating
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            type="submit"
            disabled={disabled || !value.trim()}
            icon={<SendIcon className="size-3.5" />}
          >
            Send
          </Button>
        )}
      </div>
    </form>
  );
}
