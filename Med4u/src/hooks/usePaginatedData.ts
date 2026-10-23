import { DependencyList, useCallback, useEffect, useRef, useState } from "react";
import { toApiError } from "../services/api/errors";
import { PageMeta, Paginated } from "../types/api";

interface PaginatedState<T> {
  items: T[];
  meta: PageMeta | null;
  /** First page (or a reload) is in flight. */
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const INITIAL: PaginatedState<never> = {
  items: [],
  meta: null,
  loading: true,
  loadingMore: false,
  error: null,
};

/**
 * Server-paginated list. Restarts from page 1 whenever `deps` change, appends pages on
 * `loadMore`, and ignores responses from requests that were superseded (stale filters,
 * unmount) so an old page can never overwrite newer results.
 */
export function usePaginatedData<T>(
  fetchPage: (page: number) => Promise<Paginated<T>>,
  deps: DependencyList,
) {
  const [state, setState] = useState<PaginatedState<T>>(INITIAL);
  const generation = useRef(0);
  const inFlightPage = useRef<string | null>(null);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const stateRef = useRef(state);
  stateRef.current = state;

  const loadPage = useCallback((page: number, gen: number) => {
    const requestKey = `${gen}:${page}`;
    // FlatList can call onEndReached more than once before React renders the
    // loadingMore state update. Guard synchronously so the same page is never
    // appended twice.
    if (inFlightPage.current === requestKey) {
      return;
    }
    inFlightPage.current = requestKey;
    fetchRef
      .current(page)
      .then((result) => {
        if (gen !== generation.current) {
          return;
        }
        setState((prev) => ({
          items: mergePageItems(page === 1 ? [] : prev.items, result.items),
          meta: result.meta,
          loading: false,
          loadingMore: false,
          error: null,
        }));
      })
      .catch((error: unknown) => {
        if (gen !== generation.current) {
          return;
        }
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingMore: false,
          error: toApiError(error).message,
        }));
      })
      .finally(() => {
        if (inFlightPage.current === requestKey) {
          inFlightPage.current = null;
        }
      });
  }, []);

  const reload = useCallback(() => {
    generation.current += 1;
    // Keep showing the current items while refreshing; only the first load blanks the list.
    setState((prev) => ({ ...prev, loading: true, loadingMore: false, error: null }));
    loadPage(1, generation.current);
  }, [loadPage]);

  useEffect(() => {
    generation.current += 1;
    setState(INITIAL);
    loadPage(1, generation.current);
    return () => {
      generation.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, loadPage]);

  const loadMore = useCallback(() => {
    const { meta, loading, loadingMore, error } = stateRef.current;
    if (loading || loadingMore || error || !meta || meta.page >= meta.totalPages) {
      return;
    }
    setState((prev) => ({ ...prev, loadingMore: true }));
    loadPage(meta.page + 1, generation.current);
  }, [loadPage]);

  return { ...state, reload, loadMore };
}

function mergePageItems<T>(existing: T[], incoming: T[]): T[] {
  const seen = new Set<string | number>();
  const merged: T[] = [];
  for (const item of [...existing, ...incoming]) {
    const id =
      item && typeof item === "object" && "id" in item
        ? (item as { id?: unknown }).id
        : undefined;
    if (typeof id === "string" || typeof id === "number") {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    merged.push(item);
  }
  return merged;
}
