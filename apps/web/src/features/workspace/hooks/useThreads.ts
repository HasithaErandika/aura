import { useCallback, useState } from "react";
import { describeError } from "@/shared/api/errors.ts";
import { useAsync } from "@/shared/hooks/useAsync.ts";
import { workspaceApi } from "../api.ts";
import { replaceThread } from "../lib/threads.ts";
import type { Thread } from "../types.ts";

export function useThreads(agentId: string | null) {
  const state = useAsync(() => (agentId ? workspaceApi.threads(agentId) : Promise.resolve<Thread[]>([])), [agentId]);
  const [error, setError] = useState<string | null>(null);
  const { setData } = state;

  const upsert = useCallback((thread: Thread) => setData((prev) => replaceThread(prev ?? [], thread)), [setData]);

  const create = useCallback(async (): Promise<Thread | null> => {
    if (!agentId) return null;
    setError(null);
    try {
      const thread = await workspaceApi.createThread(agentId);
      upsert(thread);
      return thread;
    } catch (err) {
      setError(describeError(err));
      return null;
    }
  }, [agentId, upsert]);

  const rename = useCallback(
    async (id: string, title: string): Promise<boolean> => {
      if (!agentId) return false;
      setError(null);
      try {
        upsert(await workspaceApi.renameThread(agentId, id, title));
        return true;
      } catch (err) {
        setError(describeError(err));
        return false;
      }
    },
    [agentId, upsert],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (!agentId) return false;
      setError(null);
      try {
        await workspaceApi.deleteThread(agentId, id);
        setData((prev) => (prev ?? []).filter((t) => t.id !== id));
        return true;
      } catch (err) {
        setError(describeError(err));
        return false;
      }
    },
    [agentId, setData],
  );

  return { threads: state.data ?? [], loading: state.loading, error: error ?? state.error, clearError: () => setError(null), create, rename, remove, upsert };
}
