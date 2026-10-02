import { useState } from "react";
import { describeError } from "@/shared/api/errors.ts";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { Select } from "@/shared/ui/Select.tsx";
import { Spinner } from "@/shared/ui/Spinner.tsx";
import { jiraApi } from "../api.ts";
import type { JiraIssueDetail } from "../types.ts";

export function StatusMover({ issueKey, onMoved }: { issueKey: string; onMoved: (issue: JiraIssueDetail) => void }) {
  const state = useAsync(() => jiraApi.transitions(issueKey), [issueKey]);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transitions = state.data ?? [];

  async function move(transitionId: string) {
    if (!transitionId) return;
    setMoving(true);
    setError(null);
    try {
      onMoved(await jiraApi.transition(issueKey, transitionId));
      await state.reload();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink-600">Status:</span>
        {state.loading && !state.data ? (
          <Spinner size="sm" />
        ) : transitions.length > 0 ? (
          <Select aria-label={`Move ${issueKey}`} value="" disabled={moving} onChange={(e) => void move(e.target.value)} className="h-8 w-auto max-w-[200px] text-xs">
            <option value="" disabled>
              Move to...
            </option>
            {transitions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.toStatus}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-ink-400">No further moves available.</span>
        )}
        {moving ? <Spinner size="sm" /> : null}
      </div>
      {error || state.error ? (
        <p className="text-danger" role="alert">
          {error ?? state.error}
        </p>
      ) : null}
    </div>
  );
}
