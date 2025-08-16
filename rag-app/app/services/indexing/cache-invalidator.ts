// Task 19.10: Intelligent cache invalidation for indexing pipeline
import { createSupabaseAdmin } from '~/utils/supabase.server';
import { DebugLogger } from '~/utils/debug-logger';
import { LRUCache } from 'lru-cache';
import { EventEmitter } from 'events';

interface CacheEntry {
  key: string;
  value: any;
  entityType: string;
  entityId: string;
  dependencies: Set<string>;
  lastAccessed: number;
  hitCount: number;
  size: number;
}

interface InvalidationRule {
  entityType: string;
  operation: 'insert' | 'update' | 'delete';
  invalidates: string[];
  cascadeDepth: number;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  invalidations: number;
  hitRate: number;
  memoryUsage: number;
}

export class IntelligentCacheInvalidator extends EventEmitter {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('CacheInvalidator');
  
  // Multi-tier cache
  private readonly l1Cache: LRUCache<string, CacheEntry>;
  private readonly l2Cache: LRUCache<string, CacheEntry>;
  
  // Dependency tracking
  private readonly dependencyGraph = new Map<string, Set<string>>();
  private readonly reverseDependencies = new Map<string, Set<string>>();
  
  // Invalidation rules
  private readonly invalidationRules: InvalidationRule[] = [
    {
      entityType: 'page',
      operation: 'update',
      invalidates: ['page_content', 'page_embeddings', 'page_summary'],
      cascadeDepth: 2
    },
    {
      entityType: 'page',
      operation: 'delete',
      invalidates: ['page_*', 'block_*', 'workspace_summary'],
      cascadeDepth: 3
    },
    {
      entityType: 'block',
      operation: 'update',
      invalidates: ['block_content', 'page_content', 'block_embeddings'],
      cascadeDepth: 1
    },
    {
      entityType: 'database',
      operation: 'update',
      invalidates: ['db_schema', 'db_rows', 'db_aggregates'],
      cascadeDepth: 2
    },
    {
      entityType: 'workspace',
      operation: 'update',
      invalidates: ['workspace_*'],
      cascadeDepth: 1
    }
  ];
  
  // Metrics
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
    hitRate: 0,
    memoryUsage: 0
  };
  
  // Configuration
  private readonly L1_MAX_SIZE = 1000; // Number of entries
  private readonly L1_MAX_AGE = 5 * 60 * 1000; // 5 minutes
  private readonly L2_MAX_SIZE = 5000; // Number of entries
  private readonly L2_MAX_AGE = 30 * 60 * 1000; // 30 minutes
  private readonly INVALIDATION_BATCH_SIZE = 100;

  constructor() {
    super();
    
    // Initialize L1 cache (hot cache)
    this.l1Cache = new LRUCache<string, CacheEntry>({
      max: this.L1_MAX_SIZE,
      ttl: this.L1_MAX_AGE,
      updateAgeOnGet: true,
      dispose: (value, key) => this.handleEviction(key, value, 'l1')
    });
    
    // Initialize L2 cache (warm cache)
    this.l2Cache = new LRUCache<string, CacheEntry>({
      max: this.L2_MAX_SIZE,
      ttl: this.L2_MAX_AGE,
      updateAgeOnGet: false,
      dispose: (value, key) => this.handleEviction(key, value, 'l2')
    });
    
    // Start metrics collection
    this.startMetricsCollection();
  }

  /**
   * Get value from cache with intelligent tier management
   */
  async get(key: string): Promise<any | null> {
    // Check L1 cache first
    let entry = this.l1Cache.get(key);
    
    if (entry) {
      this.metrics.hits++;
      entry.hitCount++;
      entry.lastAccessed = Date.now();
      this.emit('cache_hit', { key, tier: 'l1' });
      return entry.value;
    }
    
    // Check L2 cache
    entry = this.l2Cache.get(key);
    
    if (entry) {
      this.metrics.hits++;
      entry.hitCount++;
      entry.lastAccessed = Date.now();
      
      // Promote to L1 if frequently accessed
      if (entry.hitCount > 3) {
        this.promoteToL1(key, entry);
      }
      
      this.emit('cache_hit', { key, tier: 'l2' });
      return entry.value;
    }
    
    // Cache miss
    this.metrics.misses++;
    this.emit('cache_miss', { key });
    return null;
  }

  /**
   * Set value in cache with dependency tracking
   */
  async set(
    key: string,
    value: any,
    entityType: string,
    entityId: string,
    dependencies: string[] = []
  ): Promise<void> {
    const entry: CacheEntry = {
      key,
      value,
      entityType,
      entityId,
      dependencies: new Set(dependencies),
      lastAccessed: Date.now(),
      hitCount: 0,
      size: this.estimateSize(value)
    };
    
    // Add to L1 cache
    this.l1Cache.set(key, entry);
    
    // Track dependencies
    this.updateDependencies(key, dependencies);
    
    this.emit('cache_set', { key, entityType, entityId });
  }

  /**
   * Invalidate cache entries based on entity changes
   */
  async invalidate(
    entityType: string,
    entityId: string,
    operation: 'insert' | 'update' | 'delete'
  ): Promise<void> {
    const startTime = Date.now();
    const invalidatedKeys = new Set<string>();
    
    try {
      // Find applicable invalidation rules
      const rules = this.invalidationRules.filter(
        rule => rule.entityType === entityType && rule.operation === operation
      );
      
      // Apply invalidation rules
      for (const rule of rules) {
        const patterns = rule.invalidates;
        
        for (const pattern of patterns) {
          const keys = this.findMatchingKeys(pattern, entityId);
          
          for (const key of keys) {
            invalidatedKeys.add(key);
            
            // Cascade invalidation to dependencies
            if (rule.cascadeDepth > 0) {
              const cascaded = await this.cascadeInvalidation(
                key,
                rule.cascadeDepth - 1
              );
              cascaded.forEach(k => invalidatedKeys.add(k));
            }
          }
        }
      }
      
      // Perform batch invalidation
      await this.batchInvalidate(Array.from(invalidatedKeys));
      
      const duration = Date.now() - startTime;
      this.logger.info('Cache invalidation completed', {
        entityType,
        entityId,
        operation,
        keysInvalidated: invalidatedKeys.size,
        duration
      });
      
      this.emit('invalidation_complete', {
        entityType,
        entityId,
        operation,
        keysInvalidated: invalidatedKeys.size
      });
      
    } catch (error) {
      this.logger.error('Cache invalidation failed', error);
      throw error;
    }
  }

  /**
   * Find cache keys matching a pattern
   */
  private findMatchingKeys(pattern: string, entityId: string): string[] {
    const keys: string[] = [];
    const regex = new RegExp(
      pattern.replace('*', '.*').replace('$entityId', entityId)
    );
    
    // Search L1 cache
    for (const [key] of this.l1Cache.entries()) {
      if (regex.test(key)) {
        keys.push(key);
      }
    }
    
    // Search L2 cache
    for (const [key] of this.l2Cache.entries()) {
      if (regex.test(key)) {
        keys.push(key);
      }
    }
    
    return keys;
  }

  /**
   * Cascade invalidation through dependency graph
   */
  private async cascadeInvalidation(
    key: string,
    depth: number
  ): Promise<Set<string>> {
    const invalidated = new Set<string>();
    
    if (depth <= 0) return invalidated;
    
    // Get dependent keys
    const dependents = this.reverseDependencies.get(key) || new Set();
    
    for (const dependent of dependents) {
      invalidated.add(dependent);
      
      // Recursively cascade
      if (depth > 1) {
        const cascaded = await this.cascadeInvalidation(dependent, depth - 1);
        cascaded.forEach(k => invalidated.add(k));
      }
    }
    
    return invalidated;
  }

  /**
   * Batch invalidate multiple keys
   */
  private async batchInvalidate(keys: string[]): Promise<void> {
    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < keys.length; i += this.INVALIDATION_BATCH_SIZE) {
      const batch = keys.slice(i, i + this.INVALIDATION_BATCH_SIZE);
      
      await Promise.all(
        batch.map(key => this.invalidateKey(key))
      );
    }
    
    this.metrics.invalidations += keys.length;
  }

  /**
   * Invalidate a single cache key
   */
  private async invalidateKey(key: string): Promise<void> {
    // Remove from both caches
    this.l1Cache.delete(key);
    this.l2Cache.delete(key);
    
    // Clean up dependencies
    this.cleanupDependencies(key);
    
    this.emit('key_invalidated', { key });
  }

  /**
   * Promote entry from L2 to L1 cache
   */
  private promoteToL1(key: string, entry: CacheEntry): void {
    // Remove from L2
    this.l2Cache.delete(key);
    
    // Add to L1
    this.l1Cache.set(key, entry);
    
    this.emit('cache_promotion', { key, from: 'l2', to: 'l1' });
  }

  /**
   * Handle cache eviction
   */
  private handleEviction(
    key: string,
    entry: CacheEntry,
    tier: 'l1' | 'l2'
  ): void {
    this.metrics.evictions++;
    
    // If evicted from L1, demote to L2
    if (tier === 'l1' && entry.hitCount > 1) {
      this.l2Cache.set(key, entry);
      this.emit('cache_demotion', { key, from: 'l1', to: 'l2' });
    } else {
      // Clean up dependencies
      this.cleanupDependencies(key);
      this.emit('cache_eviction', { key, tier });
    }
  }

  /**
   * Update dependency tracking
   */
  private updateDependencies(key: string, dependencies: string[]): void {
    // Track forward dependencies
    this.dependencyGraph.set(key, new Set(dependencies));
    
    // Track reverse dependencies
    for (const dep of dependencies) {
      if (!this.reverseDependencies.has(dep)) {
        this.reverseDependencies.set(dep, new Set());
      }
      this.reverseDependencies.get(dep)!.add(key);
    }
  }

  /**
   * Clean up dependency tracking for a key
   */
  private cleanupDependencies(key: string): void {
    // Remove forward dependencies
    const deps = this.dependencyGraph.get(key);
    if (deps) {
      for (const dep of deps) {
        const reverse = this.reverseDependencies.get(dep);
        if (reverse) {
          reverse.delete(key);
          if (reverse.size === 0) {
            this.reverseDependencies.delete(dep);
          }
        }
      }
      this.dependencyGraph.delete(key);
    }
    
    // Remove as a dependency for others
    const reverse = this.reverseDependencies.get(key);
    if (reverse) {
      for (const dependent of reverse) {
        const forward = this.dependencyGraph.get(dependent);
        if (forward) {
          forward.delete(key);
        }
      }
      this.reverseDependencies.delete(key);
    }
  }

  /**
   * Estimate size of a value in bytes
   */
  private estimateSize(value: any): number {
    if (typeof value === 'string') {
      return value.length * 2; // Rough estimate for UTF-16
    } else if (typeof value === 'object') {
      return JSON.stringify(value).length * 2;
    } else {
      return 8; // Default size for primitives
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      this.updateMetrics();
    }, 60000); // Update every minute
  }

  /**
   * Update cache metrics
   */
  private updateMetrics(): void {
    const totalRequests = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = totalRequests > 0 
      ? this.metrics.hits / totalRequests 
      : 0;
    
    // Calculate memory usage
    let memoryUsage = 0;
    for (const [, entry] of this.l1Cache.entries()) {
      memoryUsage += entry.size;
    }
    for (const [, entry] of this.l2Cache.entries()) {
      memoryUsage += entry.size;
    }
    this.metrics.memoryUsage = memoryUsage;
    
    this.emit('metrics_updated', this.metrics);
    
    // Log if hit rate is low
    if (this.metrics.hitRate < 0.5 && totalRequests > 100) {
      this.logger.warn('Low cache hit rate detected', {
        hitRate: this.metrics.hitRate,
        totalRequests
      });
    }
  }

  /**
   * Get current cache metrics
   */
  getMetrics(): CacheMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Preload cache with frequently accessed data
   */
  async preload(workspaceId: string): Promise<void> {
    try {
      // Preload page summaries
      const { data: pages } = await this.supabase
        .from('pages')
        .select('id, title, content')
        .eq('workspace_id', workspaceId)
        .limit(100);
      
      if (pages) {
        for (const page of pages) {
          const key = `page_summary:${page.id}`;
          await this.set(
            key,
            { title: page.title, preview: page.content?.substring(0, 200) },
            'page',
            page.id,
            [`workspace:${workspaceId}`]
          );
        }
      }
      
      this.logger.info('Cache preload completed', {
        workspaceId,
        pagesLoaded: pages?.length || 0
      });
      
    } catch (error) {
      this.logger.error('Cache preload failed', error);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.l1Cache.clear();
    this.l2Cache.clear();
    this.dependencyGraph.clear();
    this.reverseDependencies.clear();
    
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0,
      hitRate: 0,
      memoryUsage: 0
    };
    
    this.emit('cache_cleared');
  }

  /**
   * Get cache status
   */
  getStatus(): {
    l1Size: number;
    l2Size: number;
    dependencyCount: number;
    metrics: CacheMetrics;
  } {
    return {
      l1Size: this.l1Cache.size,
      l2Size: this.l2Cache.size,
      dependencyCount: this.dependencyGraph.size,
      metrics: this.getMetrics()
    };
  }
}

// Create singleton instance
export const cacheInvalidator = new IntelligentCacheInvalidator();