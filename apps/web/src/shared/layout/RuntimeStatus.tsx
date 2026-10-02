import { api } from "../api/client.ts";
import { describeError } from "../api/errors.ts";
import type { RuntimeHealth } from "../api/types.ts";
import { useAsync } from "../hooks/useAsync.ts";
import { usePolling } from "../hooks/usePolling.ts";
import { cn } from "../lib/cn.ts";

async function loadHealth(): Promise<RuntimeHealth> {
  try {
    return (await api.get<{ runtime: RuntimeHealth }>("/health/runtime")).runtime;
  } catch (err) {
    return { ok: false, agents: [], message: describeError(err) };
  }
}

export function RuntimeStatus() {
  const { data, reload } = useAsync(loadHealth, []);
  usePolling(reload, 30_000, true);

  const ok = data?.ok ?? false;
  const text = data ? (ok ? "online" : "offline") : "checking";
  const title = !data ? "Checking agent runtime" : ok ? `Agent runtime online (${data.agents.length} agents)` : `Agent runtime offline${data.message ? `: ${data.message}` : ""}`;

  return (
    <div className="hidden items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-600 sm:flex" title={title} role="status" aria-label={title}>
      <span className={cn("size-2 rounded-full", data ? (ok ? "bg-success" : "bg-danger") : "bg-ink-300")} aria-hidden />
      <span className="font-medium">Runtime</span>
      <span className="text-ink-500">{text}</span>
    </div>
  );
}
