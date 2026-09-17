import { api } from "../api/client.ts";
import { useAsync } from "../hooks/useAsync.ts";
import { usePolling } from "../hooks/usePolling.ts";
import type { RuntimeHealth } from "../../types/api.ts";
import { cn } from "../lib/cn.ts";

interface Response {
  runtime: RuntimeHealth & { url: string };
}

// Live reachability of apps/agent-runtime as seen by the API. Polled quietly.
export function RuntimeStatus() {
  const { data, error, reload } = useAsync(
    () => api.get<Response>("/health/runtime").catch((err: unknown) => ({ runtime: { ok: false, agents: [], url: "", message: err instanceof Error ? err.message : "unreachable" } })),
    [],
  );
  usePolling(reload, 30_000, true);

  const ok = data?.runtime.ok ?? false;
  const title = ok ? `Agent runtime online (${data?.runtime.agents.length ?? 0} agents)` : (data?.runtime.message ?? error ?? "Checking agent runtime");

  return (
    <div className="hidden items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-600 sm:flex" title={title}>
      <span className={cn("size-2 rounded-full", data ? (ok ? "bg-success" : "bg-danger") : "bg-ink-300")} />
      <span className="font-medium">Runtime</span>
      <span className="text-ink-500">{data ? (ok ? "online" : "offline") : "checking"}</span>
    </div>
  );
}
