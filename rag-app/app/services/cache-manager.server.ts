/**
 * Cache Manager Service
 * Handles caching of API responses to reduce costs and improve performance
 */

import { createHash } from 'crypto';
import { getRedisClient } from '~/utils/redis.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('cache-manager');

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
  compress?: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  savedCost: number;
  savedTokens: number;
}

export class CacheManagerService {
  private static instance: CacheManagerService;
  private stats: CacheStats;
  private defaultTTL: number;
  private namespace: string;

  private constructor() {
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      savedCost: 0,
      savedTokens: 0
    };
    this.defaultTTL = parseInt(process.env.CACHE_TTL || '3600'); // 1 hour default
    this.namespace = process.env.CACHE_NAMESPACE || 'ai-cache';
  }

  static getInstance(): CacheManagerService {
    if (!CacheManagerService.instance) {
      CacheManagerService.instance = new CacheManagerService();
    }
    return CacheManagerService.instance;
  }

  /**
   * Generate a cache key based on query and context
   */
  async generateKey(query: string, context: string, options?: any): Promise<string> {
    const data = {
      query: query.trim().toLowerCase(),
      context: context.slice(0, 1000), // Use first 1000 chars for key
      options: options || {}
    };
    
    const hash = createHash('sha256');
    hash.update(JSON.stringify(data));
    const key = `${this.namespace}:${hash.digest('hex')}`;
    
    logger.trace('Generated cache key', {
      key,
      queryLength: query.length,
      contextLength: context.length
    });
    
    return key;
  }

  /**
   * Get cached response
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const redis = await getRedisClient();
      if (!redis) {
        logger.trace('Redis not available, cache disabled');
        return null;
      }

      const cached = await redis.get(key);
      
      if (cached) {
        this.stats.hits++;
        this.updateHitRate();
        
        logger.trace('Cache hit', {
          key,
          size: cached.length,
          hitRate: this.stats.hitRate
        });
        
        // Track saved costs (approximate)
        this.stats.savedCost += 0.00025; // Approximate cost saved
        this.stats.savedTokens += Math.ceil(cached.length / 4); // Approximate tokens
        
        return JSON.parse(cached);
      }
      
      this.stats.misses++;
      this.updateHitRate();
      
      logger.trace('Cache miss', {
        key,
        hitRate: this.stats.hitRate
      });
      
      return null;
    } catch (error) {
      logger.warn('Cache get failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Set cached response
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const redis = await getRedisClient();
      if (!redis) {
        logger.trace('Redis not available, cache disabled');
        return false;
      }

      const serialized = JSON.stringify(value);
      const effectiveTTL = ttl || this.defaultTTL;
      
      await redis.setex(key, effectiveTTL, serialized);
      
      logger.trace('Cache set', {
        key,
        ttl: effectiveTTL,
        size: serialized.length
      });
      
      return true;
    } catch (error) {
      logger.warn('Cache set failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Delete cached entry
   */
  async delete(key: string): Promise<boolean> {
    try {
      const redis = await getRedisClient();
      if (!redis) return false;

      await redis.del(key);
      
      logger.trace('Cache entry deleted', { key });
      
      return true;
    } catch (error) {
      logger.warn('Cache delete failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Clear all cache entries with pattern
   */
  async clear(pattern?: string): Promise<number> {
    try {
      const redis = await getRedisClient();
      if (!redis) return 0;

      const searchPattern = pattern 
        ? `${this.namespace}:${pattern}*` 
        : `${this.namespace}:*`;
      
      const keys = await redis.keys(searchPattern);
      
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      
      logger.trace('Cache cleared', {
        pattern: searchPattern,
        keysDeleted: keys.length
      });
      
      return keys.length;
    } catch (error) {
      logger.warn('Cache clear failed', {
        pattern,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      savedCost: 0,
      savedTokens: 0
    };
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    if (total > 0) {
      this.stats.hitRate = this.stats.hits / total;
    }
  }

  /**
   * Warm up cache with common queries
   */
  async warmUp(commonQueries: Array<{ query: string; context: string; response: any }>): Promise<void> {
    logger.info('Warming up cache', { queryCount: commonQueries.length });
    
    for (const item of commonQueries) {
      const key = await this.generateKey(item.query, item.context);
      await this.set(key, item.response, this.defaultTTL * 2); // Longer TTL for warm-up
    }
    
    logger.info('Cache warm-up complete');
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return process.env.ENABLE_CACHE !== 'false';
  }

  /**
   * Get optimal TTL based on query type
   */
  getOptimalTTL(queryType: 'simple' | 'analysis' | 'complex' | 'creative'): number {
    switch (queryType) {
      case 'simple':
        return 7200; // 2 hours for simple queries
      case 'analysis':
        return 3600; // 1 hour for analysis
      case 'complex':
        return 1800; // 30 minutes for complex queries
      case 'creative':
        return 900; // 15 minutes for creative content
      default:
        return this.defaultTTL;
    }
  }

  /**
   * Cache invalidation strategy
   */
  async invalidate(patterns: {
    userId?: string;
    fileId?: string;
    queryType?: string;
  }): Promise<number> {
    const invalidationPatterns: string[] = [];
    
    if (patterns.userId) {
      invalidationPatterns.push(`user:${patterns.userId}`);
    }
    if (patterns.fileId) {
      invalidationPatterns.push(`file:${patterns.fileId}`);
    }
    if (patterns.queryType) {
      invalidationPatterns.push(`type:${patterns.queryType}`);
    }
    
    let totalDeleted = 0;
    for (const pattern of invalidationPatterns) {
      totalDeleted += await this.clear(pattern);
    }
    
    logger.trace('Cache invalidated', {
      patterns,
      totalDeleted
    });
    
    return totalDeleted;
  }
}

// Export singleton instance
export const cacheManager = CacheManagerService.getInstance();