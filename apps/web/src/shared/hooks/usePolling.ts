import { useEffect, useRef } from "react";

// Calls `fn` every `intervalMs` while `active` is true. Pauses when the tab is hidden.
export function usePolling(fn: () => void | Promise<void>, intervalMs: number, active: boolean) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") void ref.current();
    };
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
}
