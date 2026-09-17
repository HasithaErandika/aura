import { useCallback, useEffect, useRef, useState } from "react";
import { describeError } from "../api/errors.ts";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

// Loads data on mount and whenever `deps` change. `reload` refetches without clearing the
// current data so tables do not flash empty.
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  const version = useRef(0);

  useEffect(() => {
    loaderRef.current = loader;
  });

  const run = useCallback(async () => {
    const current = ++version.current;
    try {
      const result = await loaderRef.current();
      if (current === version.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (current === version.current) setError(describeError(err));
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loaderRef.current = loader;
    setLoading(true);
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const setDataStable = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setData((prev) => (typeof updater === "function" ? (updater as (p: T | null) => T | null)(prev) : updater));
  }, []);

  return { data, loading, error, reload: run, setData: setDataStable };
}
