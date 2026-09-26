/**
 * Hook for managing documentation cache for offline access
 */

import { useState, useEffect, useCallback } from 'react';

const DOCS_CACHE_NAME = 'stellar-docs-v1';

interface DocsCacheState {
  isCached: boolean;
  isUpdating: boolean;
  lastUpdated: Date | null;
  error: string | null;
}

interface DocsCacheEntry {
  url: string;
  timestamp: number;
  size: number;
}

export function useDocsCache() {
  const [state, setState] = useState<DocsCacheState>({
    isCached: false,
    isUpdating: false,
    lastUpdated: null,
    error: null,
  });

  const [cachedDocs, setCachedDocs] = useState<DocsCacheEntry[]>([]);

  // Check cache status on mount
  useEffect(() => {
    checkCacheStatus();
  }, []);

  const checkCacheStatus = useCallback(async () => {
    if (!('caches' in window)) {
      setState((prev) => ({ ...prev, error: 'Cache API not available' }));
      return;
    }

    try {
      const cache = await caches.open(DOCS_CACHE_NAME);
      const keys = await cache.keys();

      if (keys.length > 0) {
        const entries: DocsCacheEntry[] = [];

        for (const request of keys) {
          const response = await cache.match(request);
          if (response) {
            const timestamp = parseInt(response.headers.get('x-cache-timestamp') || '0');
            entries.push({
              url: request.url,
              timestamp: timestamp || Date.now(),
              size: response.headers.get('content-length')
                ? parseInt(response.headers.get('content-length')!)
                : 0,
            });
          }
        }

        const lastUpdated = entries.length > 0
          ? new Date(Math.max(...entries.map((e) => e.timestamp)))
          : null;

        setCachedDocs(entries);
        setState((prev) => ({
          ...prev,
          isCached: true,
          lastUpdated,
          error: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          isCached: false,
          lastUpdated: null,
          error: null,
        }));
        setCachedDocs([]);
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to check cache status',
      }));
    }
  }, []);

  const cacheDocs = useCallback(async (urls: string[]) => {
    if (!('caches' in window)) {
      setState((prev) => ({ ...prev, error: 'Cache API not available' }));
      return false;
    }

    setState((prev) => ({ ...prev, isUpdating: true, error: null }));

    try {
      const cache = await caches.open(DOCS_CACHE_NAME);

      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            // Add timestamp header for tracking
            const headers = new Headers(response.headers);
            headers.set('x-cache-timestamp', Date.now().toString());

            const cachedResponse = new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers,
            });

            await cache.put(url, cachedResponse);
          }
        } catch (error) {
          console.error(`Failed to cache ${url}:`, error);
        }
      }

      await checkCacheStatus();
      return true;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to cache documentation',
        isUpdating: false,
      }));
      return false;
    } finally {
      setState((prev) => ({ ...prev, isUpdating: false }));
    }
  }, [checkCacheStatus]);

  const clearDocsCache = useCallback(async () => {
    if (!('caches' in window)) {
      setState((prev) => ({ ...prev, error: 'Cache API not available' }));
      return false;
    }

    try {
      await caches.delete(DOCS_CACHE_NAME);
      setState((prev) => ({
        ...prev,
        isCached: false,
        lastUpdated: null,
        error: null,
      }));
      setCachedDocs([]);
      return true;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to clear cache',
      }));
      return false;
    }
  }, []);

  const updateDocsCache = useCallback(async () => {
    const criticalDocs = [
      '/docs/getting-started',
      '/docs/api-reference',
      '/docs/soroban',
      '/docs/horizon',
      '/docs/transactions',
      '/docs/operations',
      '/docs/assets',
      '/docs/contracts',
      '/docs/offline',
      '/docs/security',
    ];

    return await cacheDocs(criticalDocs);
  }, [cacheDocs]);

  const getCachedDoc = useCallback(async (url: string): Promise<Response | null> => {
    if (!('caches' in window)) return null;

    try {
      const cache = await caches.open(DOCS_CACHE_NAME);
      const response = await cache.match(url);
      return response || null;
    } catch (error) {
      console.error('Failed to get cached doc:', error);
      return null;
    }
  }, []);

  const isDocCached = useCallback(async (url: string): Promise<boolean> => {
    const cached = await getCachedDoc(url);
    return cached !== null;
  }, [getCachedDoc]);

  return {
    ...state,
    cachedDocs,
    cacheDocs,
    clearDocsCache,
    updateDocsCache,
    getCachedDoc,
    isDocCached,
    checkCacheStatus,
  };
}
