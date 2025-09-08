import { DebugLogger } from '~/utils/debug-logger';
import { ultraLightEmbeddingQueue } from '../queues/ultra-light-embedding-queue';
import { asyncEmbeddingService } from '../async-embedding.service';
import { prisma } from '~/utils/db.server';
import { redis } from '~/utils/redis.server';

export interface EmbeddingSystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  components: {
    redis: {
      connected: boolean;
      error?: string;
    };
    database: {
      connected: boolean;
      embeddingCount?: number;
      error?: string;
    };
    queues: {
      ultraLight: {
        available: boolean;
        metrics?: {
          waiting: number;
          active: number;
          completed: number;
          failed: number;
          delayed: number;
        };
      };
      regular: {
        available: boolean;
        status?: string;
      };
    };
    workers: {
      ultraLight: {
        running: boolean;
      };
      regular: {
        running: boolean;
      };
    };
  };
  recentErrors: Array<{
    timestamp: string;
    component: string;
    error: string;
  }>;
}

export interface EmbeddingMetrics {
  timestamp: string;
  queues: {
    ultraLight: {
      jobsPerMinute: number;
      averageProcessingTime: number;
      successRate: number;
      queueSize: number;
    };
    regular: {
      pendingCount: number;
      processingCount: number;
      completedCount: number;
      failedCount: number;
    };
  };
  database: {
    totalEmbeddings: number;
    embeddingsByWorkspace: Record<string, number>;
    averageChunksPerPage: number;
    storageSize: string;
  };
  performance: {
    lastHour: {
      pagesIndexed: number;
      embeddingsGenerated: number;
      averageTimePerPage: number;
    };
  };
}

/**
 * Monitoring service for the embedding system
 */
export class EmbeddingMonitor {
  private static instance: EmbeddingMonitor;
  private logger = new DebugLogger('EmbeddingMonitor');
  private recentErrors: Array<{ timestamp: string; component: string; error: string }> = [];
  private metricsCache: Map<string, { value: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 seconds cache
  
  private constructor() {}
  
  static getInstance(): EmbeddingMonitor {
    if (!EmbeddingMonitor.instance) {
      EmbeddingMonitor.instance = new EmbeddingMonitor();
    }
    return EmbeddingMonitor.instance;
  }
  
  /**
   * Get overall system health
   */
  async getHealth(): Promise<EmbeddingSystemHealth> {
    const health: EmbeddingSystemHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      components: {
        redis: await this.checkRedisHealth(),
        database: await this.checkDatabaseHealth(),
        queues: await this.checkQueuesHealth(),
        workers: await this.checkWorkersHealth(),
      },
      recentErrors: this.recentErrors.slice(-10), // Last 10 errors
    };
    
    // Determine overall status
    const components = health.components;
    if (!components.redis.connected || !components.database.connected) {
      health.status = 'unhealthy';
    } else if (!components.queues.ultraLight.available || 
               components.queues.ultraLight.metrics?.failed && 
               components.queues.ultraLight.metrics.failed > 10) {
      health.status = 'degraded';
    }
    
    return health;
  }
  
  /**
   * Get detailed metrics
   */
  async getMetrics(): Promise<EmbeddingMetrics> {
    const [queueMetrics, dbMetrics, perfMetrics] = await Promise.all([
      this.getQueueMetrics(),
      this.getDatabaseMetrics(),
      this.getPerformanceMetrics(),
    ]);
    
    return {
      timestamp: new Date().toISOString(),
      queues: queueMetrics,
      database: dbMetrics,
      performance: perfMetrics,
    };
  }
  
  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<{ connected: boolean; error?: string }> {
    try {
      if (!redis) {
        return { connected: false, error: 'Redis not configured' };
      }
      
      // Try to ping Redis
      await redis.ping();
      return { connected: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logError('redis', errorMsg);
      return { connected: false, error: errorMsg };
    }
  }
  
  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<{
    connected: boolean;
    embeddingCount?: number;
    error?: string;
  }> {
    try {
      // Try to count embeddings
      const result = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count FROM page_embeddings LIMIT 1
      `;
      
      const count = this.safeBigIntToNumber(result[0]?.count) || 0;
      
      return {
        connected: true,
        embeddingCount: count,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logError('database', errorMsg);
      return { connected: false, error: errorMsg };
    }
  }
  
  /**
   * Check queues health
   */
  private async checkQueuesHealth(): Promise<{
    ultraLight: {
      available: boolean;
      metrics?: any;
    };
    regular: {
      available: boolean;
      status?: string;
    };
  }> {
    const ultraLightMetrics = await ultraLightEmbeddingQueue.getMetrics();
    
    return {
      ultraLight: {
        available: ultraLightMetrics.isAvailable,
        metrics: ultraLightMetrics.isAvailable ? {
          waiting: ultraLightMetrics.waiting || 0,
          active: ultraLightMetrics.active || 0,
          completed: ultraLightMetrics.completed || 0,
          failed: ultraLightMetrics.failed || 0,
          delayed: ultraLightMetrics.delayed || 0,
        } : undefined,
      },
      regular: {
        available: true, // Assume regular queue is available if Redis is up
        status: 'operational',
      },
    };
  }
  
  /**
   * Check workers health
   */
  private async checkWorkersHealth(): Promise<{
    ultraLight: { running: boolean };
    regular: { running: boolean };
  }> {
    try {
      const { getWorkersStatus } = await import('../workers/worker-init.server');
      const status = await getWorkersStatus();
      
      return {
        ultraLight: { running: status.ultraLightEmbedding?.isRunning || false },
        regular: { running: status.regularEmbedding?.isRunning || false },
      };
    } catch {
      // Workers might not be initialized
      return {
        ultraLight: { running: false },
        regular: { running: false },
      };
    }
  }
  
  /**
   * Get queue metrics
   */
  private async getQueueMetrics(): Promise<any> {
    const cacheKey = 'queueMetrics';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    
    const ultraLightMetrics = await ultraLightEmbeddingQueue.getMetrics();
    
    const metrics = {
      ultraLight: {
        jobsPerMinute: 0, // Would need to track over time
        averageProcessingTime: 0, // Would need to track
        successRate: this.calculateSuccessRate(
          ultraLightMetrics.completed || 0,
          ultraLightMetrics.failed || 0
        ),
        queueSize: (ultraLightMetrics.waiting || 0) + (ultraLightMetrics.active || 0),
      },
      regular: {
        pendingCount: 0, // Would need to get from async-embedding service
        processingCount: 0,
        completedCount: 0,
        failedCount: 0,
      },
    };
    
    this.setCached(cacheKey, metrics);
    return metrics;
  }
  
  /**
   * Get database metrics
   */
  private async getDatabaseMetrics(): Promise<any> {
    const cacheKey = 'dbMetrics';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    
    try {
      const [totalCount, workspaceCounts, avgChunks, storageSize] = await Promise.all([
        // Total embeddings
        prisma.$queryRaw<any[]>`
          SELECT COUNT(*) as count FROM page_embeddings
        `,
        
        // Embeddings by workspace
        prisma.$queryRaw<any[]>`
          SELECT workspace_id, COUNT(*) as count 
          FROM page_embeddings 
          GROUP BY workspace_id
          LIMIT 10
        `,
        
        // Average chunks per page
        prisma.$queryRaw<any[]>`
          SELECT AVG(chunk_count) as avg FROM (
            SELECT page_id, COUNT(*) as chunk_count 
            FROM page_embeddings 
            GROUP BY page_id
          ) as chunks_per_page
        `,
        
        // Storage size estimate
        prisma.$queryRaw<any[]>`
          SELECT pg_size_pretty(pg_total_relation_size('page_embeddings')) as size
        `,
      ]);
      
      const metrics = {
        totalEmbeddings: this.safeBigIntToNumber(totalCount[0]?.count) || 0,
        embeddingsByWorkspace: workspaceCounts.reduce((acc, row) => {
          acc[row.workspace_id] = this.safeBigIntToNumber(row.count);
          return acc;
        }, {} as Record<string, number>),
        averageChunksPerPage: Number(avgChunks[0]?.avg) || 0,
        storageSize: storageSize[0]?.size || 'Unknown',
      };
      
      this.setCached(cacheKey, metrics);
      return metrics;
    } catch (error) {
      this.logger.error('Failed to get database metrics', error);
      return {
        totalEmbeddings: 0,
        embeddingsByWorkspace: {},
        averageChunksPerPage: 0,
        storageSize: 'Error',
      };
    }
  }
  
  /**
   * Get performance metrics
   */
  private async getPerformanceMetrics(): Promise<any> {
    const cacheKey = 'perfMetrics';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    
    try {
      const oneHourAgo = new Date(Date.now() - 3600000);
      
      const result = await prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(DISTINCT page_id) as pages_indexed,
          COUNT(*) as embeddings_generated
        FROM page_embeddings
        WHERE created_at > ${oneHourAgo}
      `;
      
      const metrics = {
        lastHour: {
          pagesIndexed: this.safeBigIntToNumber(result[0]?.pages_indexed) || 0,
          embeddingsGenerated: this.safeBigIntToNumber(result[0]?.embeddings_generated) || 0,
          averageTimePerPage: 0, // Would need to track processing times
        },
      };
      
      this.setCached(cacheKey, metrics);
      return metrics;
    } catch (error) {
      this.logger.error('Failed to get performance metrics', error);
      return {
        lastHour: {
          pagesIndexed: 0,
          embeddingsGenerated: 0,
          averageTimePerPage: 0,
        },
      };
    }
  }
  
  /**
   * Log an error for tracking
   */
  private logError(component: string, error: string): void {
    this.recentErrors.push({
      timestamp: new Date().toISOString(),
      component,
      error,
    });
    
    // Keep only last 100 errors
    if (this.recentErrors.length > 100) {
      this.recentErrors = this.recentErrors.slice(-100);
    }
  }
  
  /**
   * Calculate success rate
   */
  private calculateSuccessRate(completed: number, failed: number): number {
    const total = completed + failed;
    if (total === 0) return 100;
    return Math.round((completed / total) * 100);
  }
  
  /**
   * Get cached value
   */
  private getCached(key: string): any {
    const cached = this.metricsCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value;
    }
    return null;
  }
  
  /**
   * Set cached value
   */
  private setCached(key: string, value: any): void {
    this.metricsCache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }
  
  /**
   * Helper to safely convert BigInt to number
   */
  private safeBigIntToNumber(value: any): number {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    return value || 0;
  }
  
  /**
   * Clear metrics cache
   */
  clearCache(): void {
    this.metricsCache.clear();
  }
}

// Export singleton instance
export const embeddingMonitor = EmbeddingMonitor.getInstance();