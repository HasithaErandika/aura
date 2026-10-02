import { cn } from "../lib/cn.ts";
import { Spinner } from "./Spinner.tsx";

export function LoadingState({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex justify-center py-16", className)}>
      <Spinner label={label} />
    </div>
  );
}
