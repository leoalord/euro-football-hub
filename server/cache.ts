/**
 * In-memory stale-while-revalidate cache.
 *
 * Fresh hits return immediately. Expired entries are still served (up to
 * `staleMs`) while a single background refresh runs. Concurrent callers
 * share the same in-flight fetch so a cache miss never fans out.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function getCacheTTL(): number {
  const hour = new Date().getUTCHours();
  // Typical European match window (early kickoffs through late games)
  if (hour >= 10 && hour <= 23) {
    return 5 * 60 * 1000;
  }
  return 30 * 60 * 1000;
}

export function peekCache<T>(key: string): CacheEntry<T> | undefined {
  return store.get(key) as CacheEntry<T> | undefined;
}

export interface CachedOptions<T> {
  /** How long after TTL to keep serving stale data (default 1 hour). */
  staleMs?: number;
  /** If provided and returns false, the result is not stored (stale kept). */
  shouldCache?: (data: T) => boolean;
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  options: CachedOptions<T> = {},
): Promise<T> {
  const staleMs = options.staleMs ?? 60 * 60 * 1000;
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;

  if (entry && now - entry.timestamp < ttlMs) {
    return entry.data;
  }

  const refresh = (): Promise<T> => {
    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = (async () => {
      try {
        const data = await fetcher();
        const ok = !options.shouldCache || options.shouldCache(data);
        if (ok) {
          store.set(key, { data, timestamp: Date.now() });
          return data;
        }
        return entry ? entry.data : data;
      } catch (err) {
        if (entry) {
          console.warn(`[cache] ${key}: fetch failed, serving stale data`);
          return entry.data;
        }
        throw err;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, promise);
    return promise;
  };

  if (entry && now - entry.timestamp < ttlMs + staleMs) {
    void refresh();
    return entry.data;
  }

  return refresh();
}

/**
 * Warm immediately, then refresh just before the current TTL expires so
 * visitors almost never wait on ESPN/Kalshi.
 */
export function startBackgroundRefresh(task: () => Promise<void>): void {
  const run = () =>
    task().catch((err) => console.error("[cache] background refresh failed:", err));

  const scheduleNext = () => {
    const delay = Math.max(60_000, getCacheTTL() - 60_000);
    const timer = setTimeout(() => {
      void run().finally(scheduleNext);
    }, delay);
    timer.unref?.();
  };

  const initial = setTimeout(() => {
    void run().finally(scheduleNext);
  }, 0);
  initial.unref?.();
}
