import { useEffect, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { XIcon } from "../icons/index.tsx";

// A minimal, dependency-free modal: overlay + centered panel, Escape to close, click-outside to
// close. Shared by anything that needs a focused dialog over the current page (viewing a Jira
// Task's detail, running a one-off action) instead of navigating away from it.
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  widthClassName = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  widthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div className={cn("relative flex max-h-[85vh] w-full flex-col rounded-xl border border-line bg-surface shadow-xl", widthClassName)}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-ink-500">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700">
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
