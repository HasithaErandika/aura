import { useAsync } from "../../../shared/hooks/useAsync.ts";
import { usePolling } from "../../../shared/hooks/usePolling.ts";
import { dockerRunsApi } from "../api.ts";
import { Card, CardHeader } from "../../../shared/ui/Card.tsx";
import { Badge } from "../../../shared/ui/Badge.tsx";

// "What Dockers are running" - visibility into Gate 4 (scaffold), Gate 5 (coding), and Gate 7
// (test) containers, all labeled `aura=true` by lib/docker-exec.ts. Purely observational;
// silently renders nothing on error (e.g. a role without dev-agent access, or Docker itself not
// running) rather than showing an alarming error box on a page most roles can see.
export function DockerRunsPanel({ epicKey, title, description }: { epicKey?: string; title?: string; description?: string }) {
  const state = useAsync(() => dockerRunsApi.list(epicKey), [epicKey]);
  // Container state doesn't change fast enough to need 5s resolution, and this is the
  // most expensive poll in the app (shells out to `docker ps` on the agent-runtime server).
  usePolling(state.reload, 20_000, true);

  const runs = state.data ?? [];

  if (state.error || (!state.loading && runs.length === 0)) return null;

  return (
    <Card>
      <CardHeader title={title ?? "Active Docker runs"} description={description ?? "Gate 4/5/7 containers, currently running or recently exited."} />
      <div className="divide-y divide-line">
        {runs.map((run) => {
          const running = run.state.toLowerCase() === "running";
          return (
            <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-semibold text-ink-900">{run.name}</p>
                <p className="text-[11px] text-ink-500">
                  {run.kind ?? "run"}
                  {run.epic ? ` · ${run.epic}` : ""}
                  {run.task ? ` · ${run.task}` : ""} · {run.image}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={running ? "success" : "neutral"} dot>
                  {run.status}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
