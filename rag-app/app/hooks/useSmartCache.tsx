import useSWR, { SWRConfig, mutate } from 'swr';
import useSWRInfinite from 'swr/infinite';
import { useCallback, useEffect, useRef } from 'react';
import React from 'react';

export interface SmartCacheOptions {
  revalidateOnFocus?: boolean;
  revalidateOnReconnect?: boolean;
  refreshInterval?: number;
  dedupingInterval?: number;
  prefetch?: boolean;
  prefetchKeys?: string[];
}

/**
 * Smart client-side caching with SWR
 * Targets: >90% cache hit rate, <50ms data access
 */
export function useSmartCache<T = any>(
  key: string | null,
  fetcher: (key: string) => Promise<T>,
  options: SmartCacheOptions = {}
) {
  const accessTimeRef = useRef<number>(0);
  
  // Track cache access time
  const wrappedFetcher = useCallback(async (key: string) => {
    accessTimeRef.current = performance.now();
    const data = await fetcher(key);
    const accessTime = performance.now() - accessTimeRef.current;
    
    if (accessTime > 50) {
      console.warn(`[useSmartCache] Slow fetch for ${key}: ${accessTime.toFixed(2)}ms`);
    }
    
    return data;
  }, [fetcher]);
  
  const { data, error, isLoading, isValidating, mutate: localMutate } = useSWR(
    key,
    wrappedFetcher,
    {
      revalidateOnFocus: options.revalidateOnFocus ?? false,
      revalidateOnReconnect: options.revalidateOnReconnect ?? true,
      refreshInterval: options.refreshInterval,
      dedupingInterval: options.dedupingInterval ?? 2000,
      // Keep previous data while revalidating
      keepPreviousData: true,
    }
  );
  
  // Track the key for cache management
  useEffect(() => {
    if (key) {
      CacheManager.trackKey(key);
    }
  }, [key]);
  
  // Prefetch related data
  useEffect(() => {
    if (options.prefetch && options.prefetchKeys) {
      options.prefetchKeys.forEach(prefetchKey => {
        // Trigger fetch but don't await
        mutate(prefetchKey, fetcher(prefetchKey), { revalidate: false });
      });
    }
  }, [options.prefetch, options.prefetchKeys, fetcher]);
  
  // Optimistic update function
  const optimisticUpdate = useCallback(async (
    updater: (current: T | undefined) => T,
    shouldRevalidate: boolean = true
  ) => {
    const startTime = performance.now();
    
    // Apply optimistic update
    await localMutate(async (current) => {
      return updater(current);
    }, { revalidate: shouldRevalidate });
    
    const updateTime = performance.now() - startTime;
    if (updateTime > 50) {
      console.warn(`[useSmartCache] Slow optimistic update: ${updateTime.toFixed(2)}ms`);
    }
  }, [localMutate]);
  
  return {
    data,
    error,
    isLoading,
    isValidating,
    mutate: localMutate,
    optimisticUpdate,
  };
}

/**
 * Prefetch hook for preloading data
 */
export function usePrefetch() {
  const prefetchedKeys = useRef<Set<string>>(new Set());
  
  const prefetch = useCallback(async <T = any>(
    key: string,
    fetcher: () => Promise<T>
  ) => {
    // Avoid duplicate prefetches
    if (prefetchedKeys.current.has(key)) {
      return;
    }
    
    prefetchedKeys.current.add(key);
    
    try {
      const data = await fetcher();
      // Populate SWR cache
      mutate(key, data, { revalidate: false });
      console.log(`[usePrefetch] Prefetched: ${key}`);
    } catch (error) {
      console.error(`[usePrefetch] Error prefetching ${key}:`, error);
      prefetchedKeys.current.delete(key);
    }
  }, []);
  
  const prefetchMultiple = useCallback(async (
    items: Array<{ key: string; fetcher: () => Promise<any> }>
  ) => {
    const promises = items.map(({ key, fetcher }) => prefetch(key, fetcher));
    await Promise.all(promises);
  }, [prefetch]);
  
  return { prefetch, prefetchMultiple };
}

/**
 * Infinite loading hook with caching
 */
export function useInfiniteCache<T = any>(
  getKey: (pageIndex: number, previousPageData: T | null) => string | null,
  fetcher: (key: string) => Promise<T>,
  options: SmartCacheOptions = {}
) {
  const { data, error, size, setSize, isLoading, isValidating } = useSWRInfinite(
    getKey,
    fetcher,
    {
      revalidateOnFocus: options.revalidateOnFocus ?? false,
      revalidateOnReconnect: options.revalidateOnReconnect ?? true,
      dedupingInterval: options.dedupingInterval ?? 2000,
    }
  );
  
  const loadMore = useCallback(() => {
    setSize(size + 1);
  }, [size, setSize]);
  
  const hasMore = data && data[data.length - 1] !== null;
  
  return {
    data,
    error,
    isLoading,
    isValidating,
    loadMore,
    hasMore,
  };
}

/**
 * Cache manager for manual cache operations
 */
export class CacheManager {
  private static cacheKeys: Set<string> = new Set();
  
  /**
   * Clear all cache
   */
  static clearAll() {
    // Clear all cached keys using mutate
    mutate(() => true, undefined, { revalidate: false });
    this.cacheKeys.clear();
    console.log('[CacheManager] All cache cleared');
  }
  
  /**
   * Clear specific keys
   */
  static clear(keys: string[]) {
    keys.forEach(key => {
      mutate(key, undefined, { revalidate: false });
      this.cacheKeys.delete(key);
    });
    console.log(`[CacheManager] Cleared ${keys.length} keys`);
  }
  
  /**
   * Get cache statistics
   */
  static getStats() {
    const keys = Array.from(this.cacheKeys);
    const size = keys.length;
    
    return {
      size,
      keys: keys.slice(0, 10), // First 10 keys for debugging
    };
  }
  
  /**
   * Track a cache key (internal use)
   */
  static trackKey(key: string) {
    this.cacheKeys.add(key);
  }
  
  /**
   * Preload critical data
   */
  static async preloadCritical(
    items: Array<{ key: string; fetcher: () => Promise<any> }>
  ) {
    const startTime = performance.now();
    
    const promises = items.map(async ({ key, fetcher }) => {
      try {
        const data = await fetcher();
        mutate(key, data, { revalidate: false });
        return { key, success: true };
      } catch (error) {
        return { key, success: false, error };
      }
    });
    
    const results = await Promise.all(promises);
    const duration = performance.now() - startTime;
    
    const successful = results.filter(r => r.success).length;
    console.log(
      `[CacheManager] Preloaded ${successful}/${items.length} items in ${duration.toFixed(2)}ms`
    );
    
    return results;
  }
}

/**
 * Provider for SWR configuration
 */
export function SmartCacheProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 2000,
        keepPreviousData: true,
        onError: (error) => {
          console.error('[SmartCache] SWR Error:', error);
        },
        onSuccess: (data, key) => {
          console.log(`[SmartCache] Cached: ${key}`);
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}