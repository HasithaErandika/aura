import { useState } from "react";
import { Button } from "./Button.tsx";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <Button size="sm" onClick={() => void copy()} aria-live="polite">
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </Button>
  );
}
