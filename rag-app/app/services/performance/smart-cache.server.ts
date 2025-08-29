import { redis } from '~/utils/redis.server';
import { LRUCache } from 'lru-cache';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  staleWhileRevalidate?: boolean;
  tags?: string[];
}

/**
 * Multi-tier caching system with Redis and in-memory LRU cache
 * Targets: >90% cache hit rate for repeated operations
 */
export class SmartCacheService {
  private memoryCache: LRUCache<string, any>;
  private hitRate = { hits: 0, misses: 0 };
  private prefetchQueue: Set<string> = new Set();
  
  constructor() {
    // In-memory LRU cache (Level 1)
    this.memoryCache = new LRUCache({
      max: 500, // Max 500 items
      ttl: 1000 * 60 * 5, // 5 minutes default TTL
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });
  }
  
  /**
   * Get value from cache (checks memory first, then Redis)
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = performance.now();
    
    // Level 1: Memory cache
    const memoryValue = this.memoryCache.get(key);
    if (memoryValue !== undefined) {
      this.hitRate.hits++;
      this.logPerformance('memory', startTime);
      return memoryValue;
    }
    
    // Level 2: Redis cache
    try {
      const redisValue = await redis.get(key);
      if (redisValue) {
        const parsed = JSON.parse(redisValue);
        // Populate memory cache
        this.memoryCache.set(key, parsed);
        this.hitRate.hits++;
        this.logPerformance('redis', startTime);
        return parsed;
      }
    } catch (error) {
      console.error('[SmartCache] Redis error:', error);
    }
    
    this.hitRate.misses++;
    this.logPerformance('miss', startTime);
    return null;
  }
  
  /**
   * Set value in both cache tiers
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const ttl = options.ttl || 300; // Default 5 minutes
    
    // Set in memory cache
    this.memoryCache.set(key, value, { ttl: ttl * 1000 });
    
    // Set in Redis
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
      
      // Handle tags for cache invalidation
      if (options.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          await redis.sadd(`tag:${tag}`, key);
          await redis.expire(`tag:${tag}`, ttl);
        }
      }
    } catch (error) {
      console.error('[SmartCache] Redis set error:', error);
    }
  }
  
  /**
   * Invalidate cache by key or tag
   */
  async invalidate(keyOrTag: string, isTag: boolean = false): Promise<void> {
    if (isTag) {
      // Invalidate all keys with this tag
      try {
        const keys = await redis.smembers(`tag:${keyOrTag}`);
        for (const key of keys) {
          this.memoryCache.delete(key);
          await redis.del(key);
        }
        await redis.del(`tag:${keyOrTag}`);
      } catch (error) {
        console.error('[SmartCache] Tag invalidation error:', error);
      }
    } else {
      // Invalidate specific key
      this.memoryCache.delete(keyOrTag);
      try {
        await redis.del(keyOrTag);
      } catch (error) {
        console.error('[SmartCache] Key invalidation error:', error);
      }
    }
  }
  
  /**
   * Prefetch data for likely next actions
   */
  async prefetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<void> {
    // Avoid duplicate prefetch requests
    if (this.prefetchQueue.has(key)) {
      return;
    }
    
    this.prefetchQueue.add(key);
    
    try {
      // Check if already cached
      const cached = await this.get(key);
      if (cached) {
        return;
      }
      
      // Fetch and cache
      const data = await fetcher();
      await this.set(key, data, options);
      
      console.log(`[SmartCache] Prefetched: ${key}`);
    } catch (error) {
      console.error(`[SmartCache] Prefetch error for ${key}:`, error);
    } finally {
      this.prefetchQueue.delete(key);
    }
  }
  
  /**
   * Batch get multiple keys
   */
  async mget<T>(keys: string[]): Promise<Map<string, T>> {
    const results = new Map<string, T>();
    const missingKeys: string[] = [];
    
    // Check memory cache first
    for (const key of keys) {
      const value = this.memoryCache.get(key);
      if (value !== undefined) {
        results.set(key, value);
      } else {
        missingKeys.push(key);
      }
    }
    
    // Fetch missing from Redis
    if (missingKeys.length > 0) {
      try {
        const redisValues = await redis.mget(...missingKeys);
        redisValues.forEach((value, index) => {
          if (value) {
            const parsed = JSON.parse(value);
            results.set(missingKeys[index], parsed);
            // Populate memory cache
            this.memoryCache.set(missingKeys[index], parsed);
          }
        });
      } catch (error) {
        console.error('[SmartCache] Batch get error:', error);
      }
    }
    
    return results;
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hitRate.hits + this.hitRate.misses;
    const hitRate = total > 0 ? (this.hitRate.hits / total) * 100 : 0;
    
    return {
      hitRate: `${hitRate.toFixed(2)}%`,
      hits: this.hitRate.hits,
      misses: this.hitRate.misses,
      memoryCacheSize: this.memoryCache.size,
      memoryCacheMax: this.memoryCache.max,
      meetsTarget: hitRate >= 90,
    };
  }
  
  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      await redis.flushdb();
    } catch (error) {
      console.error('[SmartCache] Clear error:', error);
    }
    this.hitRate = { hits: 0, misses: 0 };
  }
  
  /**
   * Log cache performance
   */
  private logPerformance(source: string, startTime: number) {
    const duration = performance.now() - startTime;
    if (duration > 10) {
      console.warn(`[SmartCache] Slow ${source} access: ${duration.toFixed(2)}ms`);
    }
  }
}

// Singleton instance
export const smartCache = new SmartCacheService();

/**
 * Cache decorator for methods
 */
export function Cacheable(options: CacheOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;
      
      // Try to get from cache
      const cached = await smartCache.get(cacheKey);
      if (cached !== null) {
        return cached;
      }
      
      // Execute original method
      const result = await originalMethod.apply(this, args);
      
      // Cache the result
      await smartCache.set(cacheKey, result, options);
      
      return result;
    };
    
    return descriptor;
  };
}