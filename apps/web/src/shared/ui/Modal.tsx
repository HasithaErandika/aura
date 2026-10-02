import { useEffect, useId, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { XIcon } from "../icons/index.tsx";
import { IconButton } from "./IconButton.tsx";

export function Modal({ open, onClose, title, description, children, widthClassName = "max-w-lg" }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; widthClassName?: string }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={cn("relative flex max-h-[90vh] w-full flex-col rounded-t-xl border border-line bg-surface shadow-xl sm:max-h-[85vh] sm:rounded-xl", widthClassName)}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-semibold text-ink-900">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-xs text-ink-500">{description}</p> : null}
          </div>
          <IconButton label="Close" icon={<XIcon className="size-4" />} onClick={onClose} />
        </div>
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>
  );
}
