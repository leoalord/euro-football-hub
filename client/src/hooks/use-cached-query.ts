import { useQuery, type QueryKey, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

const PREFIX = "efh-cache:v3:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function readPersisted<T>(key: QueryKey): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + JSON.stringify(key));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - parsed.ts > MAX_AGE_MS) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

function writePersisted(key: QueryKey, data: unknown) {
  try {
    localStorage.setItem(PREFIX + JSON.stringify(key), JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // quota / private mode
  }
}

/**
 * Like useQuery, but paints the last successful response from localStorage
 * immediately while a background refetch runs. Makes revisits feel instant
 * even when the server cache is cold.
 */
export function useCachedQuery<TData>(options: {
  queryKey: QueryKey;
  refetchInterval?: number | false;
  staleTime?: number;
}): UseQueryResult<TData, Error> {
  const persisted = useMemo(
    () => readPersisted<TData>(options.queryKey),
    [JSON.stringify(options.queryKey)],
  );

  const query = useQuery({
    queryKey: options.queryKey,
    refetchInterval: options.refetchInterval,
    staleTime: options.staleTime,
    placeholderData: persisted,
  } as UseQueryOptions<TData, Error, TData, QueryKey>);

  useEffect(() => {
    if (query.data && !query.isPlaceholderData) {
      writePersisted(options.queryKey, query.data);
    }
  }, [query.data, query.isPlaceholderData, options.queryKey]);

  return query;
}
