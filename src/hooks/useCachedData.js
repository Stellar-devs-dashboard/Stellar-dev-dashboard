/**
 * useCachedData — React hooks for intelligent data fetching with caching
 *
 * Hooks exported:
 *   useCachedData          — generic SWR-style fetch with L1/L2 cache
 *   useCachedAccount       — Stellar account with tag-based invalidation
 *   useCachedTransactions  — paginated transaction history
 *   useCachedNetworkStats  — network stats with short TTL
 *   useCachedPaginatedData — generic paginated fetch
 *   useCachedItem          — single-item fetch by id
 *   useOfflineStatus       — online/offline state + queue length
 *   useCacheStats          — live cache statistics for a debug panel
 */

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import cache, { TTL, isOffline } from '../lib/cache.js';
import {
  getCachedApiResponse,
  setCachedApiResponse,
  getOfflineQueue,
} from '../lib/storage.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function noop() {}

/**
 * Deduplicate in-flight requests: if two hooks request the same key
 * simultaneously, only one network call is made.
 */
const _inflight = new Map(); // key → Promise

async function deduplicatedFetch(key, fetcher) {
  if (_inflight.has(key)) return _inflight.get(key);
  const p = fetcher().finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}

// ─── useCachedData ────────────────────────────────────────────────────────────

/**
 * Generic SWR-style hook.
 *
 * @param {string|null}  cacheKey   Unique key. Pass null to skip fetching.
 * @param {Function}     fetchFn    async () => data
 * @param {object}       [opts]
 * @param {number}       [opts.ttl]           TTL in ms (default: TTL.ACCOUNT)
 * @param {string[]}     [opts.tags]          Cache tags for invalidation
 * @param {boolean}      [opts.enabled]       Set false to pause fetching
 * @param {boolean}      [opts.persist]       Also read/write IndexedDB
 * @param {number}       [opts.refreshInterval] Auto-refresh interval in ms
 * @param {Array}        [opts.deps]          Extra deps that trigger refetch
 * @param {Function}     [opts.onSuccess]     (data) => void
 * @param {Function}     [opts.onError]       (err) => void
 *
 * @returns {{ data, loading, error, stale, source, refetch, invalidate }}
 */
export function useCachedData(cacheKey, fetchFn, opts = {}) {
  const {
    ttl             = TTL.ACCOUNT,
    tags            = [],
    enabled         = true,
    persist         = false,
    refreshInterval = 0,
    deps            = [],
    onSuccess       = noop,
    onError         = noop,
  } = opts;

  const [data,    setData]    = useState(() => (cacheKey ? cache.get(cacheKey) : null));
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [stale,   setStale]   = useState(false);
  const [source,  setSource]  = useState('init');

  const mountedRef  = useRef(true);
  const fetchFnRef  = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const doFetch = useCallback(async (skipCache = false) => {
    if (!cacheKey || !enabled) return;

    // 1. Try L1 memory cache
    if (!skipCache) {
      const { value, stale: isStale, source: src } = await cache.getWithFallback(cacheKey);
      if (value !== null) {
        if (mountedRef.current) {
          setData(value);
          setStale(isStale);
          setSource(src);
          setLoading(false);
          setError(null);
        }
        if (!isStale) return; // Fresh — no network needed
        // Stale — continue to background refresh below
      }

      // 2. Try L2 IndexedDB if persist=true
      if (persist && !value) {
        const stored = await getCachedApiResponse(cacheKey);
        if (stored !== null) {
          if (mountedRef.current) {
            setData(stored);
            setStale(true);
            setSource('indexeddb');
            setLoading(false);
          }
          // Still refresh in background
        }
      }
    }

    // 3. Network fetch (deduplicated)
    if (!mountedRef.current) return;
    setLoading(true);

    try {
      const fresh = await deduplicatedFetch(cacheKey, () => fetchFnRef.current());
      cache.set(cacheKey, fresh, ttl, tags);
      if (persist) setCachedApiResponse(cacheKey, fresh, ttl).catch(noop);

      if (mountedRef.current) {
        setData(fresh);
        setStale(false);
        setSource('network');
        setLoading(false);
        setError(null);
        onSuccess(fresh);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err);
        setLoading(false);
        onError(err);
      }
    }
  }, [cacheKey, enabled, persist, ttl, tags.join(',')]); // eslint-disable-line

  // Initial fetch + dep changes
  useEffect(() => {
    mountedRef.current = true;
    doFetch();
    return () => { mountedRef.current = false; };
  }, [cacheKey, enabled, ...deps]); // eslint-disable-line

  // Auto-refresh interval
  useEffect(() => {
    if (!refreshInterval || !enabled || !cacheKey) return;
    const id = setInterval(() => doFetch(true), refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval, enabled, cacheKey]); // eslint-disable-line

  // Subscribe to cache updates from other hooks / background refreshes
  useEffect(() => {
    if (!cacheKey) return;
    return cache.subscribe(cacheKey, (value) => {
      if (mountedRef.current) {
        setData(value);
        setStale(false);
        setSource('subscription');
      }
    });
  }, [cacheKey]);

  const refetch    = useCallback(() => doFetch(true), [doFetch]);
  const invalidate = useCallback(() => {
    if (cacheKey) cache.delete(cacheKey);
    doFetch(true);
  }, [cacheKey, doFetch]);

  return { data, loading, error, stale, source, refetch, invalidate };
}

// ─── useCachedAccount ─────────────────────────────────────────────────────────

/**
 * Fetch and cache a Stellar account. Automatically invalidates when
 * the connected address or network changes.
 *
 * @param {string|null} publicKey
 * @param {string}      network
 * @param {Function}    fetcher   async (publicKey, network) => accountData
 */
export function useCachedAccount(publicKey, network, fetcher) {
  const key = publicKey ? `account:${publicKey}:${network}` : null;

  return useCachedData(
    key,
    useCallback(() => fetcher(publicKey, network), [publicKey, network]), // eslint-disable-line
    {
      ttl:     TTL.ACCOUNT,
      tags:    ['account', `account:${publicKey}`],
      persist: true,
      enabled: !!publicKey,
    }
  );
}

// ─── useCachedTransactions ────────────────────────────────────────────────────

/**
 * Paginated transaction history with cursor-based paging.
 *
 * @param {string|null} publicKey
 * @param {string}      network
 * @param {Function}    fetcher   async (publicKey, network, limit, cursor) => { records, nextCursor, hasMore }
 * @param {number}      [limit]
 */
export function useCachedTransactions(publicKey, network, fetcher, limit = 20) {
  const [cursor,  setCursor]  = useState(null);
  const [allData, setAllData] = useState([]);
  const [hasMore, setHasMore] = useState(true);

  const key = publicKey ? `transactions:${publicKey}:${network}:${limit}:${cursor}` : null;

  const { data, loading, error, refetch } = useCachedData(
    key,
    useCallback(
      () => fetcher(publicKey, network, limit, cursor),
      [publicKey, network, limit, cursor] // eslint-disable-line
    ),
    { ttl: TTL.TRANSACTIONS, tags: ['transactions', `account:${publicKey}`], enabled: !!publicKey }
  );

  useEffect(() => {
    if (!data) return;
    const records = data.records || data;
    setAllData((prev) => {
      const ids = new Set(prev.map((r) => r.id));
      return [...prev, ...records.filter((r) => !ids.has(r.id))];
    });
    setHasMore(data.hasMore ?? records.length === limit);
  }, [data]);

  // Reset when account/network changes
  useEffect(() => {
    setAllData([]);
    setCursor(null);
    setHasMore(true);
  }, [publicKey, network]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore && data?.nextCursor) {
      setCursor(data.nextCursor);
    }
  }, [loading, hasMore, data]);

  return { data: allData, loading, error, hasMore, loadMore, refetch };
}

// ─── useCachedNetworkStats ────────────────────────────────────────────────────

/**
 * Network stats with a short TTL and optional auto-refresh.
 *
 * @param {string}   network
 * @param {Function} fetcher  async (network) => stats
 * @param {number}   [refreshInterval]  ms between auto-refreshes (0 = off)
 */
export function useCachedNetworkStats(network, fetcher, refreshInterval = 0) {
  const key = `networkStats:${network}`;
  return useCachedData(
    key,
    useCallback(() => fetcher(network), [network]), // eslint-disable-line
    { ttl: TTL.LEDGER, tags: ['network'], refreshInterval }
  );
}

// ─── useCachedPaginatedData ───────────────────────────────────────────────────

/**
 * Generic paginated hook (page-number based).
 */
export function useCachedPaginatedData(cacheKey, fetchFn, opts = {}) {
  const { limit = 20, ...rest } = opts;
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const pagedKey = cacheKey ? `${cacheKey}:p${page}:l${limit}` : null;

  const result = useCachedData(
    pagedKey,
    useCallback(() => fetchFn({ page, limit }), [page, limit]), // eslint-disable-line
    { ...rest }
  );

  useEffect(() => {
    if (result.data && result.data.length < limit) setHasMore(false);
  }, [result.data, limit]);

  const loadMore = useCallback(() => {
    if (!result.loading && hasMore) setPage((p) => p + 1);
  }, [result.loading, hasMore]);

  return { ...result, data: result.data || [], page, limit, hasMore, loadMore, setPage };
}

// ─── useCachedItem ────────────────────────────────────────────────────────────

/**
 * Fetch a single item by id with caching.
 */
export function useCachedItem(cacheKeyPrefix, id, fetchFn, opts = {}) {
  const key = id != null ? `${cacheKeyPrefix}:${id}` : null;
  return useCachedData(
    key,
    useCallback(() => fetchFn(id), [id]), // eslint-disable-line
    { enabled: id != null, ...opts }
  );
}

// ─── useOfflineStatus ─────────────────────────────────────────────────────────

/**
 * Returns { online, queueLength } and updates reactively.
 */
export function useOfflineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [queueLength, setQueueLength] = useState(0);

  useEffect(() => {
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Poll queue length every 5 s
  useEffect(() => {
    const refresh = () => getOfflineQueue().then((q) => setQueueLength(q.length)).catch(noop);
    refresh();
    const id = setInterval(refresh, 5_000);
    return () => clearInterval(id);
  }, []);

  return { online, queueLength };
}

// ─── useCacheStats ────────────────────────────────────────────────────────────

/**
 * Live cache statistics — useful for a debug/diagnostics panel.
 * Refreshes every `interval` ms.
 */
export function useCacheStats(interval = 2_000) {
  const [stats, setStats] = useState(() => cache.getStats());

  useEffect(() => {
    const id = setInterval(() => setStats(cache.getStats()), interval);
    return () => clearInterval(id);
  }, [interval]);

  const clearAll = useCallback(() => {
    cache.clear();
    setStats(cache.getStats());
  }, []);

  const invalidateTag = useCallback((tag) => {
    cache.invalidateTag(tag);
    setStats(cache.getStats());
  }, []);

  return { stats, clearAll, invalidateTag };
}

// ─── Default export ───────────────────────────────────────────────────────────

export default useCachedData;
