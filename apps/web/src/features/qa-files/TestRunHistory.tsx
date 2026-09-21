import { useAsync } from "../../shared/hooks/useAsync.ts";
import { qaFilesApi } from "./api.ts";
import { Card, CardHeader } from "../../shared/ui/Card.tsx";
import { Badge } from "../../shared/ui/Badge.tsx";
import { Skeleton } from "../../shared/ui/Skeleton.tsx";
import { formatDateTime } from "../../shared/lib/format.ts";

const VERDICT_TONE: Record<string, "danger" | "warning" | "neutral"> = {
  "likely-real": "danger",
  "likely-flaky": "warning",
  unsure: "neutral",
};

// Gate 7's real test-run history - the machine result (passed/failed/skipped, from Playwright's
// own JSON reporter) and the Tester Agent's interpretation shown as two separate things, never
// merged into one claim (docs/ARCHITECTURE.md section 8: "machine result" vs "AI interpretation").
export function TestRunHistory({ epicKey, taskKey }: { epicKey: string; taskKey?: string }) {
  const state = useAsync(() => qaFilesApi.testRuns(epicKey, taskKey), [epicKey, taskKey]);

  if (state.loading && !state.data) {
    return (
      <Card>
        <CardHeader title="Test run history" description="Real Playwright results for this Epic (Gate 7)." />
        <div className="space-y-2 px-5 pb-5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
      </Card>
    );
  }

  const runs = state.data ?? [];
  if (state.error || runs.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Test run history" description="Real Playwright results for this Epic (Gate 7) - machine result and AI interpretation, kept separate." />
      <div className="divide-y divide-line">
        {runs.map((run) => (
          <div key={run.draftId} className="space-y-2 px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-mono text-xs font-semibold text-ink-900">{run.taskKey}</p>
                <p className="text-[11px] text-ink-400">{formatDateTime(run.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge tone={run.failed === 0 ? "success" : "danger"} dot>
                  {run.passed} passed
                </Badge>
                {run.failed > 0 ? <Badge tone="danger">{run.failed} failed</Badge> : null}
                {run.skipped > 0 ? <Badge tone="neutral">{run.skipped} skipped</Badge> : null}
              </div>
            </div>
            {run.summary ? <p className="text-xs text-ink-600">{run.summary}</p> : null}
            {run.failureNotes.length > 0 ? (
              <ul className="space-y-1 pl-3 text-xs text-ink-600">
                {run.failureNotes.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <Badge tone={VERDICT_TONE[f.verdict] ?? "neutral"} className="mt-0.5 shrink-0">
                      {f.verdict}
                    </Badge>
                    <span>
                      <span className="font-medium">{f.name}</span> — {f.note}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
