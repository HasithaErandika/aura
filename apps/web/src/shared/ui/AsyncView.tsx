import type { ReactNode } from "react";
import type { AsyncState } from "../hooks/useAsync.ts";
import { ErrorAlert } from "./ErrorAlert.tsx";
import { LoadingState } from "./LoadingState.tsx";

interface AsyncViewProps<T> {
  state: AsyncState<T>;
  loading?: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  errorClassName?: string;
  children: (data: T) => ReactNode;
}

export function AsyncView<T>({ state, loading, empty, isEmpty, errorClassName, children }: AsyncViewProps<T>) {
  if (state.data === null) {
    if (state.error) return <ErrorAlert error={state.error} onRetry={() => void state.reload()} className={errorClassName} />;
    return <>{loading ?? <LoadingState />}</>;
  }
  if (isEmpty?.(state.data) && empty !== undefined) return <>{empty}</>;
  return (
    <>
      {state.error ? <ErrorAlert error={state.error} onRetry={() => void state.reload()} className={errorClassName} /> : null}
      {children(state.data)}
    </>
  );
}
