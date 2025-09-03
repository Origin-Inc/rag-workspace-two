/**
 * Database Block Caching Service
 * 
 * Provides multi-tier caching for database blocks to handle 50,000+ records efficiently:
 * - L1: In-memory LRU cache for hot data (< 100ms response)
 * - L2: Redis cache for frequently accessed data (< 200ms response)
 * - L3: Database with optimized indexes (fallback)
 */

import { LRUCache } from 'lru-cache';
import { redis } from '~/utils/redis.server';
import { prisma } from '~/utils/db.server';
import type { DatabaseRow, DatabaseColumn } from '~/types/database-block';
import { databasePerformanceService } from './database-performance.server';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
}

interface CacheOptions {
  ttl?: number;
  maxSize?: number;
  staleWhileRevalidate?: boolean;
}

interface QueryCacheKey {
  blockId: string;
  filters?: string;
  sorts?: string;
  searchQuery?: string;
  page?: number;
  pageSize?: number;
}

export class DatabaseBlockCacheService {
  // L1: In-memory LRU cache
  private memoryCache: LRUCache<string, CacheEntry<any>>;
  
  // Cache statistics
  private stats = {
    hits: { memory: 0, redis: 0, total: 0 },
    misses: { memory: 0, redis: 0, total: 0 },
    evictions: 0,
    revalidations: 0
  };

  // Cache configuration
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MEMORY_CACHE_SIZE = 100; // MB
  private readonly REDIS_KEY_PREFIX = 'db_block_cache:';
  private readonly BATCH_SIZE = 1000; // Records per batch

  constructor() {
    this.memoryCache = new LRUCache<string, CacheEntry<any>>({
      maxSize: this.MEMORY_CACHE_SIZE * 1024 * 1024, // Convert MB to bytes
      ttl: this.DEFAULT_TTL,
      sizeCalculation: (value) => JSON.stringify(value).length,
      dispose: () => this.stats.evictions++,
      updateAgeOnGet: true,
      updateAgeOnHas: false
    });
  }

  /**
   * Get rows from cache with multi-tier fallback
   */
  async getRows(
    blockId: string,
    page: number = 1,
    pageSize: number = 100,
    filters?: any[],
    sorts?: any[],
    searchQuery?: string
  ): Promise<{ rows: DatabaseRow[]; total: number; cached: boolean } | null> {
    const startTime = Date.now();
    const cacheKey = this.buildCacheKey({ blockId, page, pageSize, filters: JSON.stringify(filters), sorts: JSON.stringify(sorts), searchQuery });
    
    // L1: Check memory cache
    const memoryResult = this.memoryCache.get(cacheKey);
    if (memoryResult) {
      this.stats.hits.memory++;
      this.stats.hits.total++;
      memoryResult.hits++;
      
      // Track cache hit in performance metrics
      await databasePerformanceService.trackQuery(
        blockId,
        `CACHE_HIT_MEMORY:${cacheKey}`,
        Date.now() - startTime,
        memoryResult.data.rows.length,
        true
      );
      
      return { ...memoryResult.data, cached: true };
    }
    this.stats.misses.memory++;

    // L2: Check Redis cache
    try {
      const redisKey = `${this.REDIS_KEY_PREFIX}${cacheKey}`;
      const redisResult = await redis.get(redisKey);
      
      if (redisResult) {
        const parsed = JSON.parse(redisResult);
        this.stats.hits.redis++;
        this.stats.hits.total++;
        
        // Promote to memory cache
        this.memoryCache.set(cacheKey, {
          data: parsed,
          timestamp: Date.now(),
          hits: 1
        });
        
        // Track cache hit
        await databasePerformanceService.trackQuery(
          blockId,
          `CACHE_HIT_REDIS:${cacheKey}`,
          Date.now() - startTime,
          parsed.rows.length,
          true
        );
        
        return { ...parsed, cached: true };
      }
    } catch (error) {
      console.error('Redis cache error:', error);
    }
    
    this.stats.misses.redis++;
    this.stats.misses.total++;
    
    return null;
  }

  /**
   * Set rows in cache (both memory and Redis)
   */
  async setRows(
    blockId: string,
    page: number,
    pageSize: number,
    rows: DatabaseRow[],
    total: number,
    filters?: any[],
    sorts?: any[],
    searchQuery?: string,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    const cacheKey = this.buildCacheKey({ blockId, page, pageSize, filters: JSON.stringify(filters), sorts: JSON.stringify(sorts), searchQuery });
    const data = { rows, total };
    
    // Set in memory cache
    this.memoryCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      hits: 0
    });
    
    // Set in Redis cache (async, don't wait)
    const redisKey = `${this.REDIS_KEY_PREFIX}${cacheKey}`;
    redis.setex(redisKey, Math.floor(ttl / 1000), JSON.stringify(data)).catch(error => {
      console.error('Redis cache set error:', error);
    });
  }

  /**
   * Invalidate cache for a specific block
   */
  async invalidateBlock(blockId: string): Promise<void> {
    // Clear memory cache entries for this block
    for (const [key] of this.memoryCache.entries()) {
      if (key.includes(blockId)) {
        this.memoryCache.delete(key);
      }
    }
    
    // Clear Redis cache entries for this block
    try {
      const pattern = `${this.REDIS_KEY_PREFIX}*${blockId}*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error('Redis cache invalidation error:', error);
    }
  }

  /**
   * Warm cache for frequently accessed data
   */
  async warmCache(blockId: string, preloadPages: number = 5): Promise<void> {
    try {
      // Get block metadata
      const block = await prisma.databaseBlock.findUnique({
        where: { id: blockId },
        select: {
          id: true,
          rowCount: true,
          columns: true
        }
      });
      
      if (!block) return;
      
      // Preload first N pages in batches
      const pageSize = 100;
      const promises: Promise<void>[] = [];
      
      for (let page = 1; page <= preloadPages; page++) {
        promises.push(this.preloadPage(blockId, page, pageSize));
      }
      
      await Promise.all(promises);
      
      console.log(`Cache warmed for block ${blockId}: ${preloadPages} pages`);
    } catch (error) {
      console.error('Cache warming error:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const memoryUsage = this.memoryCache.calculatedSize || 0;
    const hitRate = this.stats.hits.total / (this.stats.hits.total + this.stats.misses.total) || 0;
    
    return {
      ...this.stats,
      memoryUsage: `${(memoryUsage / 1024 / 1024).toFixed(2)} MB`,
      hitRate: `${(hitRate * 100).toFixed(2)}%`,
      cacheSize: this.memoryCache.size,
      maxCacheSize: this.memoryCache.max
    };
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();
    
    // Clear Redis cache
    try {
      const keys = await redis.keys(`${this.REDIS_KEY_PREFIX}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error('Redis cache clear error:', error);
    }
    
    // Reset stats
    this.stats = {
      hits: { memory: 0, redis: 0, total: 0 },
      misses: { memory: 0, redis: 0, total: 0 },
      evictions: 0,
      revalidations: 0
    };
  }

  /**
   * Batch prefetch for virtual scrolling
   */
  async prefetchBatch(
    blockId: string,
    startIndex: number,
    endIndex: number,
    pageSize: number = 100
  ): Promise<void> {
    const startPage = Math.floor(startIndex / pageSize) + 1;
    const endPage = Math.ceil(endIndex / pageSize);
    
    const promises: Promise<void>[] = [];
    for (let page = startPage; page <= endPage; page++) {
      const cacheKey = this.buildCacheKey({ blockId, page, pageSize });
      
      // Check if already cached
      if (!this.memoryCache.has(cacheKey)) {
        promises.push(this.preloadPage(blockId, page, pageSize));
      }
    }
    
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  // Private methods

  private buildCacheKey(params: QueryCacheKey): string {
    const parts = [
      params.blockId,
      params.page || 1,
      params.pageSize || 100,
      params.filters || '',
      params.sorts || '',
      params.searchQuery || ''
    ];
    return parts.join(':');
  }

  private async preloadPage(blockId: string, page: number, pageSize: number): Promise<void> {
    try {
      // Fetch from database
      const offset = (page - 1) * pageSize;
      const rows = await prisma.databaseRow.findMany({
        where: { blockId },
        skip: offset,
        take: pageSize,
        orderBy: { position: 'asc' }
      });
      
      const total = await prisma.databaseRow.count({
        where: { blockId }
      });
      
      // Cache the results
      await this.setRows(blockId, page, pageSize, rows as any, total);
    } catch (error) {
      console.error(`Failed to preload page ${page} for block ${blockId}:`, error);
    }
  }

  /**
   * Implement stale-while-revalidate pattern
   */
  async getWithSWR(
    blockId: string,
    page: number,
    pageSize: number,
    fetcher: () => Promise<{ rows: DatabaseRow[]; total: number }>
  ): Promise<{ rows: DatabaseRow[]; total: number; cached: boolean; stale?: boolean }> {
    const cacheKey = this.buildCacheKey({ blockId, page, pageSize });
    const cached = this.memoryCache.get(cacheKey);
    
    if (cached) {
      const age = Date.now() - cached.timestamp;
      const isStale = age > this.DEFAULT_TTL / 2;
      
      if (isStale) {
        // Return stale data immediately, revalidate in background
        this.stats.revalidations++;
        fetcher().then(fresh => {
          this.setRows(blockId, page, pageSize, fresh.rows, fresh.total);
        }).catch(console.error);
        
        return { ...cached.data, cached: true, stale: true };
      }
      
      return { ...cached.data, cached: true, stale: false };
    }
    
    // No cache, fetch fresh data
    const fresh = await fetcher();
    await this.setRows(blockId, page, pageSize, fresh.rows, fresh.total);
    return { ...fresh, cached: false };
  }
}

// Export singleton instance
export const databaseBlockCache = new DatabaseBlockCacheService();