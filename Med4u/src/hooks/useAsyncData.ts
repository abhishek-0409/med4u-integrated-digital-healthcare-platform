import { DependencyList, useCallback, useEffect, useState } from "react";

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
}

/**
 * Runs `load` whenever `deps` change and exposes loading/error state plus a
 * `reload` for retry. Responses from superseded or unmounted requests are ignored.
 */
export function useAsyncData<T>(load: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    loading: true,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    load()
      .then((data) => {
        if (!cancelled) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : "Something went wrong.",
          }));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);

  return { ...state, reload };
}
