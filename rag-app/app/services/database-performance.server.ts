// Database Performance Monitoring and Optimization Service
// Provides real-time performance metrics and automatic optimizations

import { createSupabaseAdmin } from '~/utils/supabase.server';
import Redis from 'ioredis';
import type { DatabasePerformanceMetrics } from '~/types/database-block-enhanced';

interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  rowsReturned: number;
  cacheHit: boolean;
  userId?: string;
}

interface IndexUsageStats {
  indexName: string;
  usageCount: number;
  avgScanTime: number;
  lastUsed: Date;
  effectiveness: number; // 0-1 score
}

interface PerformanceAlert {
  type: 'slow_query' | 'high_memory' | 'cache_miss' | 'index_scan' | 'lock_timeout';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  databaseBlockId: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

/**
 * Database Performance Monitoring Service
 * 
 * Features:
 * - Real-time query performance tracking
 * - Automatic index optimization recommendations
 * - Cache hit rate monitoring
 * - Memory usage analysis
 * - Performance alerting
 * - Query plan analysis
 * - Load balancing recommendations
 */
export class DatabasePerformanceService {
  private supabase = createSupabaseAdmin();
  private redis: Redis;
  private queryMetrics: Map<string, QueryMetrics[]> = new Map();
  private alertCallbacks: ((alert: PerformanceAlert) => void)[] = [];
  private metricsInterval?: NodeJS.Timeout;

  // Performance thresholds
  private readonly SLOW_QUERY_THRESHOLD = 1000; // ms
  private readonly HIGH_MEMORY_THRESHOLD = 500 * 1024 * 1024; // 500MB
  private readonly LOW_CACHE_HIT_THRESHOLD = 0.7; // 70%
  private readonly METRICS_RETENTION = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.startMetricsCollection();
  }

  /**
   * Start collecting performance metrics
   */
  private startMetricsCollection() {
    this.metricsInterval = setInterval(async () => {
      await this.collectMetrics();
      await this.analyzePerformance();
      await this.cleanupOldMetrics();
    }, 30000); // Every 30 seconds
  }

  /**
   * Stop metrics collection
   */
  public stopMetricsCollection() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
  }

  /**
   * Track a database query execution
   */
  public async trackQuery(
    databaseBlockId: string,
    query: string,
    duration: number,
    rowsReturned: number,
    cacheHit: boolean = false,
    userId?: string
  ): Promise<void> {
    const metric: QueryMetrics = {
      query,
      duration,
      timestamp: new Date(),
      rowsReturned,
      cacheHit,
      userId
    };

    // Store in memory for immediate analysis
    const metrics = this.queryMetrics.get(databaseBlockId) || [];
    metrics.push(metric);
    
    // Keep only recent metrics in memory
    const cutoff = Date.now() - this.METRICS_RETENTION;
    const filteredMetrics = metrics.filter(m => m.timestamp.getTime() > cutoff);
    this.queryMetrics.set(databaseBlockId, filteredMetrics);

    // Store in Redis for persistence
    await this.redis.lpush(
      `db_metrics:${databaseBlockId}:queries`,
      JSON.stringify(metric)
    );
    
    // Expire old entries
    await this.redis.expire(`db_metrics:${databaseBlockId}:queries`, 86400);

    // Check for performance issues
    if (duration > this.SLOW_QUERY_THRESHOLD) {
      await this.createAlert({
        type: 'slow_query',
        severity: duration > 5000 ? 'critical' : 'high',
        message: `Slow query detected: ${duration}ms`,
        databaseBlockId,
        metadata: { duration, query: query.substring(0, 100), rowsReturned },
        timestamp: new Date()
      });
    }
  }

  /**
   * Get comprehensive performance metrics for a database block
   */
  public async getPerformanceMetrics(databaseBlockId: string): Promise<DatabasePerformanceMetrics> {
    const [
      basicStats,
      cacheStats,
      indexStats,
      connectionStats
    ] = await Promise.all([
      this.getBasicStats(databaseBlockId),
      this.getCacheStats(databaseBlockId),
      this.getIndexStats(databaseBlockId),
      this.getConnectionStats()
    ]);

    return {
      databaseBlockId,
      rowCount: basicStats.rowCount,
      avgQueryTime: basicStats.avgQueryTime,
      cacheHitRate: cacheStats.hitRate,
      indexUsage: indexStats,
      activeConnections: connectionStats.active,
      lastOptimized: basicStats.lastOptimized
    };
  }

  /**
   * Get query performance analysis
   */
  public async getQueryAnalysis(databaseBlockId: string): Promise<{
    slowQueries: QueryMetrics[];
    topQueries: { query: string; count: number; avgDuration: number }[];
    cacheEfficiency: number;
    recommendations: string[];
  }> {
    const metrics = this.queryMetrics.get(databaseBlockId) || [];
    const recentMetrics = metrics.filter(m => 
      Date.now() - m.timestamp.getTime() < 60 * 60 * 1000 // Last hour
    );

    // Find slow queries
    const slowQueries = recentMetrics.filter(m => m.duration > this.SLOW_QUERY_THRESHOLD);

    // Aggregate query statistics
    const queryStats = new Map<string, { count: number; totalDuration: number }>();
    for (const metric of recentMetrics) {
      const queryKey = this.normalizeQuery(metric.query);
      const stats = queryStats.get(queryKey) || { count: 0, totalDuration: 0 };
      stats.count++;
      stats.totalDuration += metric.duration;
      queryStats.set(queryKey, stats);
    }

    // Top queries by frequency
    const topQueries = Array.from(queryStats.entries())
      .map(([query, stats]) => ({
        query,
        count: stats.count,
        avgDuration: stats.totalDuration / stats.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Cache efficiency
    const cacheHits = recentMetrics.filter(m => m.cacheHit).length;
    const cacheEfficiency = recentMetrics.length > 0 ? cacheHits / recentMetrics.length : 0;

    // Generate recommendations
    const recommendations = await this.generateRecommendations(databaseBlockId, recentMetrics);

    return {
      slowQueries,
      topQueries,
      cacheEfficiency,
      recommendations
    };
  }

  /**
   * Optimize database performance automatically
   */
  public async optimizeDatabase(databaseBlockId: string): Promise<{
    indexesCreated: string[];
    indexesDropped: string[];
    cacheWarmed: boolean;
    statisticsUpdated: boolean;
  }> {
    const result = {
      indexesCreated: [] as string[],
      indexesDropped: [] as string[],
      cacheWarmed: false,
      statisticsUpdated: false
    };

    try {
      // Get database block info
      const { data: dbBlock } = await this.supabase
        .from('db_blocks_enhanced')
        .select('id, schema')
        .eq('block_id', databaseBlockId)
        .single();

      if (!dbBlock) {
        throw new Error('Database block not found');
      }

      // Analyze query patterns
      const metrics = this.queryMetrics.get(databaseBlockId) || [];
      const indexRecommendations = await this.analyzeIndexNeeds(dbBlock.id, metrics);

      // Create recommended indexes
      for (const recommendation of indexRecommendations.create) {
        try {
          await this.createIndex(dbBlock.id, recommendation);
          result.indexesCreated.push(recommendation.name);
        } catch (error) {
          console.error(`Failed to create index ${recommendation.name}:`, error);
        }
      }

      // Drop unused indexes
      for (const indexName of indexRecommendations.drop) {
        try {
          await this.dropIndex(dbBlock.id, indexName);
          result.indexesDropped.push(indexName);
        } catch (error) {
          console.error(`Failed to drop index ${indexName}:`, error);
        }
      }

      // Warm up cache for frequently accessed data
      await this.warmupCache(databaseBlockId);
      result.cacheWarmed = true;

      // Update table statistics
      await this.updateStatistics(dbBlock.id);
      result.statisticsUpdated = true;

      // Record optimization
      await this.recordOptimization(databaseBlockId, result);

    } catch (error) {
      console.error('Database optimization failed:', error);
      throw error;
    }

    return result;
  }

  /**
   * Get real-time performance dashboard data
   */
  public async getDashboardData(databaseBlockId: string): Promise<{
    metrics: DatabasePerformanceMetrics;
    alerts: PerformanceAlert[];
    trends: {
      queryTime: { timestamp: Date; value: number }[];
      cacheHitRate: { timestamp: Date; value: number }[];
      throughput: { timestamp: Date; value: number }[];
    };
    topSlowQueries: QueryMetrics[];
  }> {
    const [metrics, alerts, trends, topSlowQueries] = await Promise.all([
      this.getPerformanceMetrics(databaseBlockId),
      this.getRecentAlerts(databaseBlockId),
      this.getPerformanceTrends(databaseBlockId),
      this.getTopSlowQueries(databaseBlockId)
    ]);

    return {
      metrics,
      alerts,
      trends,
      topSlowQueries
    };
  }

  /**
   * Subscribe to performance alerts
   */
  public onAlert(callback: (alert: PerformanceAlert) => void): () => void {
    this.alertCallbacks.push(callback);
    return () => {
      const index = this.alertCallbacks.indexOf(callback);
      if (index > -1) {
        this.alertCallbacks.splice(index, 1);
      }
    };
  }

  // Private methods

  private async collectMetrics(): Promise<void> {
    try {
      // Collect system metrics from Supabase
      const { data: systemStats } = await this.supabase.rpc('get_system_stats');
      
      if (systemStats) {
        await this.redis.setex(
          'db_system_stats',
          300, // 5 minutes
          JSON.stringify(systemStats)
        );
      }

      // Collect connection pool metrics
      const { data: connectionStats } = await this.supabase.rpc('get_connection_stats');
      
      if (connectionStats) {
        await this.redis.setex(
          'db_connection_stats',
          60, // 1 minute
          JSON.stringify(connectionStats)
        );
      }

    } catch (error) {
      console.error('Failed to collect metrics:', error);
    }
  }

  private async analyzePerformance(): Promise<void> {
    // Analyze metrics for all active database blocks
    const activeBlocks = await this.getActiveDatabaseBlocks();
    
    for (const blockId of activeBlocks) {
      const metrics = this.queryMetrics.get(blockId) || [];
      const recentMetrics = metrics.filter(m => 
        Date.now() - m.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
      );

      if (recentMetrics.length === 0) continue;

      // Check cache hit rate
      const cacheHits = recentMetrics.filter(m => m.cacheHit).length;
      const cacheHitRate = cacheHits / recentMetrics.length;

      if (cacheHitRate < this.LOW_CACHE_HIT_THRESHOLD) {
        await this.createAlert({
          type: 'cache_miss',
          severity: 'medium',
          message: `Low cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`,
          databaseBlockId: blockId,
          metadata: { cacheHitRate, totalQueries: recentMetrics.length },
          timestamp: new Date()
        });
      }

      // Check for table scan patterns
      const tableScanQueries = recentMetrics.filter(m => 
        m.query.toLowerCase().includes('seq scan') ||
        (m.duration > 500 && m.rowsReturned > 1000)
      );

      if (tableScanQueries.length > recentMetrics.length * 0.3) {
        await this.createAlert({
          type: 'index_scan',
          severity: 'high',
          message: `High number of table scans detected`,
          databaseBlockId: blockId,
          metadata: { tableScanQueries: tableScanQueries.length, totalQueries: recentMetrics.length },
          timestamp: new Date()
        });
      }
    }
  }

  private async cleanupOldMetrics(): Promise<void> {
    const cutoff = Date.now() - this.METRICS_RETENTION;
    
    // Cleanup in-memory metrics
    for (const [blockId, metrics] of this.queryMetrics.entries()) {
      const filteredMetrics = metrics.filter(m => m.timestamp.getTime() > cutoff);
      if (filteredMetrics.length === 0) {
        this.queryMetrics.delete(blockId);
      } else {
        this.queryMetrics.set(blockId, filteredMetrics);
      }
    }

    // Cleanup Redis metrics
    const keys = await this.redis.keys('db_metrics:*:queries');
    for (const key of keys) {
      await this.redis.ltrim(key, 0, 999); // Keep last 1000 entries
    }
  }

  private async createAlert(alert: PerformanceAlert): Promise<void> {
    // Store alert in Redis
    await this.redis.lpush('db_performance_alerts', JSON.stringify(alert));
    await this.redis.expire('db_performance_alerts', 604800); // 7 days

    // Notify subscribers
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        console.error('Alert callback failed:', error);
      }
    }
  }

  private async getBasicStats(databaseBlockId: string): Promise<{
    rowCount: number;
    avgQueryTime: number;
    lastOptimized: string;
  }> {
    const { data } = await this.supabase
      .from('db_block_stats')
      .select('total_rows, last_updated')
      .eq('db_block_id', databaseBlockId)
      .single();

    const metrics = this.queryMetrics.get(databaseBlockId) || [];
    const recentMetrics = metrics.filter(m => 
      Date.now() - m.timestamp.getTime() < 60 * 60 * 1000 // Last hour
    );

    const avgQueryTime = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
      : 0;

    return {
      rowCount: data?.total_rows || 0,
      avgQueryTime,
      lastOptimized: data?.last_updated || new Date().toISOString()
    };
  }

  private async getCacheStats(databaseBlockId: string): Promise<{ hitRate: number }> {
    const cacheKey = `db_cache_stats:${databaseBlockId}`;
    const stats = await this.redis.get(cacheKey);
    
    if (stats) {
      return JSON.parse(stats);
    }

    // Calculate from recent metrics
    const metrics = this.queryMetrics.get(databaseBlockId) || [];
    const recentMetrics = metrics.filter(m => 
      Date.now() - m.timestamp.getTime() < 60 * 60 * 1000 // Last hour
    );

    const cacheHits = recentMetrics.filter(m => m.cacheHit).length;
    const hitRate = recentMetrics.length > 0 ? cacheHits / recentMetrics.length : 0;

    // Cache the result
    await this.redis.setex(cacheKey, 300, JSON.stringify({ hitRate }));

    return { hitRate };
  }

  private async getIndexStats(databaseBlockId: string): Promise<Record<string, number>> {
    // This would query database-specific index usage statistics
    // Implementation depends on the database system
    return {};
  }

  private async getConnectionStats(): Promise<{ active: number }> {
    const stats = await this.redis.get('db_connection_stats');
    return stats ? JSON.parse(stats) : { active: 0 };
  }

  private normalizeQuery(query: string): string {
    // Remove dynamic values to group similar queries
    return query
      .replace(/\$\d+/g, '?') // Replace parameter placeholders
      .replace(/\d+/g, 'N') // Replace numbers
      .replace(/'[^']*'/g, "'string'") // Replace string literals
      .toLowerCase()
      .trim();
  }

  private async generateRecommendations(
    databaseBlockId: string,
    metrics: QueryMetrics[]
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Analyze slow queries
    const slowQueries = metrics.filter(m => m.duration > this.SLOW_QUERY_THRESHOLD);
    if (slowQueries.length > 0) {
      recommendations.push(`Consider adding indexes for ${slowQueries.length} slow queries`);
    }

    // Analyze cache hit rate
    const cacheHits = metrics.filter(m => m.cacheHit).length;
    const cacheHitRate = metrics.length > 0 ? cacheHits / metrics.length : 0;
    if (cacheHitRate < 0.8) {
      recommendations.push('Consider increasing cache size or TTL');
    }

    // Analyze query patterns
    const uniqueQueries = new Set(metrics.map(m => this.normalizeQuery(m.query))).size;
    if (uniqueQueries > 100) {
      recommendations.push('High query diversity detected - consider query optimization');
    }

    return recommendations;
  }

  private async analyzeIndexNeeds(dbBlockId: string, metrics: QueryMetrics[]): Promise<{
    create: Array<{ name: string; columns: string[]; type: string }>;
    drop: string[];
  }> {
    // Simplified index analysis
    // In production, this would use query plan analysis
    return {
      create: [],
      drop: []
    };
  }

  private async createIndex(dbBlockId: string, recommendation: any): Promise<void> {
    // Implementation would create database index
  }

  private async dropIndex(dbBlockId: string, indexName: string): Promise<void> {
    // Implementation would drop database index
  }

  private async warmupCache(databaseBlockId: string): Promise<void> {
    // Preload frequently accessed data into cache
    const commonQueries = [
      'SELECT * FROM db_block_rows_partitioned WHERE db_block_id = $1 ORDER BY position LIMIT 100',
      'SELECT COUNT(*) FROM db_block_rows_partitioned WHERE db_block_id = $1'
    ];

    const { data: dbBlock } = await this.supabase
      .from('db_blocks_enhanced')
      .select('id')
      .eq('block_id', databaseBlockId)
      .single();

    if (dbBlock) {
      for (const query of commonQueries) {
        try {
          await this.supabase.rpc('execute_query', {
            query,
            params: [dbBlock.id]
          });
        } catch (error) {
          // Ignore warmup errors
        }
      }
    }
  }

  private async updateStatistics(dbBlockId: string): Promise<void> {
    // Update database table statistics for query optimization
    await this.supabase.rpc('update_table_statistics', {
      table_name: 'db_block_rows_partitioned'
    });
  }

  private async recordOptimization(databaseBlockId: string, result: any): Promise<void> {
    await this.redis.setex(
      `db_optimization:${databaseBlockId}`,
      86400, // 24 hours
      JSON.stringify({
        timestamp: new Date().toISOString(),
        result
      })
    );
  }

  private async getActiveDatabaseBlocks(): Promise<string[]> {
    const keys = await this.redis.keys('db_metrics:*:queries');
    return keys.map(key => key.split(':')[1]);
  }

  private async getRecentAlerts(databaseBlockId: string): Promise<PerformanceAlert[]> {
    const alerts = await this.redis.lrange('db_performance_alerts', 0, 9);
    return alerts
      .map(alert => JSON.parse(alert))
      .filter(alert => alert.databaseBlockId === databaseBlockId);
  }

  private async getPerformanceTrends(databaseBlockId: string): Promise<{
    queryTime: { timestamp: Date; value: number }[];
    cacheHitRate: { timestamp: Date; value: number }[];
    throughput: { timestamp: Date; value: number }[];
  }> {
    // Implementation would fetch historical data from Redis or database
    return {
      queryTime: [],
      cacheHitRate: [],
      throughput: []
    };
  }

  private async getTopSlowQueries(databaseBlockId: string): Promise<QueryMetrics[]> {
    const metrics = this.queryMetrics.get(databaseBlockId) || [];
    return metrics
      .filter(m => m.duration > this.SLOW_QUERY_THRESHOLD)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
  }
}

export const databasePerformanceService = new DatabasePerformanceService();