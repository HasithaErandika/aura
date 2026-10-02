import { useCallback, useState } from "react";
import { describeError } from "@/shared/api/errors.ts";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { jiraApi } from "../api.ts";

export function useComments(issueKey: string) {
  const state = useAsync(() => jiraApi.comments(issueKey), [issueKey]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const { setData } = state;

  const add = useCallback(
    async (body: string): Promise<boolean> => {
      setSending(true);
      setSendError(null);
      try {
        const comment = await jiraApi.comment(issueKey, body);
        setData((prev) => [...(prev ?? []), comment]);
        return true;
      } catch (err) {
        setSendError(describeError(err));
        return false;
      } finally {
        setSending(false);
      }
    },
    [issueKey, setData],
  );

  return { state, add, sending, sendError };
}
