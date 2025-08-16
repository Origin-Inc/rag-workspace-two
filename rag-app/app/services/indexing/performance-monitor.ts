// Task 19.9: Performance monitoring system for indexing pipeline
import { createSupabaseAdmin } from '~/utils/supabase.server';
import { DebugLogger } from '~/utils/debug-logger';
import { EventEmitter } from 'events';

interface PerformanceMetrics {
  indexingLatency: number[];
  batchSizes: number[];
  errorRates: Map<string, number>;
  throughput: number;
  queueDepth: number;
  processingTimes: Map<string, number[]>;
}

interface MetricSnapshot {
  timestamp: Date;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
  count: number;
}

interface IndexingMetricEvent {
  type: 'task_started' | 'task_completed' | 'task_failed' | 'batch_processed';
  entityType?: string;
  entityId?: string;
  duration?: number;
  batchSize?: number;
  error?: string;
}

export class IndexingPerformanceMonitor extends EventEmitter {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('IndexingPerformanceMonitor');
  
  // Metrics storage
  private metrics: PerformanceMetrics = {
    indexingLatency: [],
    batchSizes: [],
    errorRates: new Map(),
    throughput: 0,
    queueDepth: 0,
    processingTimes: new Map()
  };
  
  // Configuration
  private readonly MAX_METRIC_SAMPLES = 1000;
  private readonly METRIC_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
  private readonly AUTO_ADJUST_THRESHOLD = {
    HIGH_LATENCY_MS: 1000,
    LOW_LATENCY_MS: 200,
    HIGH_ERROR_RATE: 0.05,
    QUEUE_DEPTH_HIGH: 1000,
    QUEUE_DEPTH_LOW: 100
  };
  
  // Performance tracking
  private activeOperations = new Map<string, number>();
  private metricsBuffer: IndexingMetricEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  
  // Auto-adjustment state
  private currentBatchSize = 100;
  private currentConcurrency = 5;

  constructor() {
    super();
    this.startMetricsFlush();
  }

  /**
   * Start metrics flush interval
   */
  private startMetricsFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flushMetrics();
    }, 10000); // Flush every 10 seconds
  }

  /**
   * Record the start of an indexing operation
   */
  recordOperationStart(operationId: string): void {
    this.activeOperations.set(operationId, Date.now());
  }

  /**
   * Record the completion of an indexing operation
   */
  recordOperationComplete(
    operationId: string,
    entityType: string,
    success: boolean,
    error?: string
  ): void {
    const startTime = this.activeOperations.get(operationId);
    if (!startTime) return;
    
    const duration = Date.now() - startTime;
    this.activeOperations.delete(operationId);
    
    // Record latency
    this.recordLatency(duration);
    
    // Record by entity type
    this.recordEntityProcessingTime(entityType, duration);
    
    // Record error if failed
    if (!success) {
      this.recordError(entityType, error);
    }
    
    // Emit event
    this.emit('metric', {
      type: success ? 'task_completed' : 'task_failed',
      entityType,
      entityId: operationId,
      duration,
      error
    } as IndexingMetricEvent);
    
    // Buffer for database storage
    this.metricsBuffer.push({
      type: success ? 'task_completed' : 'task_failed',
      entityType,
      entityId: operationId,
      duration,
      error
    });
  }

  /**
   * Record batch processing metrics
   */
  recordBatchProcessed(batchSize: number, duration: number, successCount: number): void {
    this.metrics.batchSizes.push(batchSize);
    this.trimMetricArray(this.metrics.batchSizes);
    
    // Calculate throughput (items per second)
    const throughput = duration > 0 ? (successCount / duration) * 1000 : 0;
    this.metrics.throughput = throughput;
    
    this.emit('metric', {
      type: 'batch_processed',
      batchSize,
      duration
    } as IndexingMetricEvent);
    
    // Auto-adjust batch size if needed
    this.autoAdjustBatchSize(duration);
  }

  /**
   * Record indexing latency
   */
  private recordLatency(latencyMs: number): void {
    this.metrics.indexingLatency.push(latencyMs);
    this.trimMetricArray(this.metrics.indexingLatency);
  }

  /**
   * Record entity-specific processing time
   */
  private recordEntityProcessingTime(entityType: string, duration: number): void {
    if (!this.metrics.processingTimes.has(entityType)) {
      this.metrics.processingTimes.set(entityType, []);
    }
    
    const times = this.metrics.processingTimes.get(entityType)!;
    times.push(duration);
    this.trimMetricArray(times);
  }

  /**
   * Record error occurrence
   */
  private recordError(entityType: string, error?: string): void {
    const key = `${entityType}:${error || 'unknown'}`;
    const current = this.metrics.errorRates.get(key) || 0;
    this.metrics.errorRates.set(key, current + 1);
  }

  /**
   * Update queue depth metric
   */
  updateQueueDepth(depth: number): void {
    this.metrics.queueDepth = depth;
    
    // Auto-adjust concurrency based on queue depth
    this.autoAdjustConcurrency(depth);
  }

  /**
   * Get current metrics snapshot
   */
  getMetricsSnapshot(): {
    latency: MetricSnapshot;
    batchSizes: MetricSnapshot;
    errorRate: number;
    throughput: number;
    queueDepth: number;
    entityMetrics: Map<string, MetricSnapshot>;
  } {
    return {
      latency: this.calculateMetricSnapshot(this.metrics.indexingLatency),
      batchSizes: this.calculateMetricSnapshot(this.metrics.batchSizes),
      errorRate: this.calculateErrorRate(),
      throughput: this.metrics.throughput,
      queueDepth: this.metrics.queueDepth,
      entityMetrics: this.calculateEntityMetrics()
    };
  }

  /**
   * Calculate percentile metrics for an array
   */
  private calculateMetricSnapshot(values: number[]): MetricSnapshot {
    if (values.length === 0) {
      return {
        timestamp: new Date(),
        p50: 0,
        p95: 0,
        p99: 0,
        avg: 0,
        min: 0,
        max: 0,
        count: 0
      };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    
    return {
      timestamp: new Date(),
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
      avg: values.reduce((a, b) => a + b, 0) / count,
      min: sorted[0],
      max: sorted[count - 1],
      count
    };
  }

  /**
   * Calculate overall error rate
   */
  private calculateErrorRate(): number {
    const totalErrors = Array.from(this.metrics.errorRates.values())
      .reduce((sum, count) => sum + count, 0);
    
    const totalOperations = this.metrics.indexingLatency.length;
    
    return totalOperations > 0 ? totalErrors / totalOperations : 0;
  }

  /**
   * Calculate metrics for each entity type
   */
  private calculateEntityMetrics(): Map<string, MetricSnapshot> {
    const entityMetrics = new Map<string, MetricSnapshot>();
    
    for (const [entityType, times] of this.metrics.processingTimes) {
      entityMetrics.set(entityType, this.calculateMetricSnapshot(times));
    }
    
    return entityMetrics;
  }

  /**
   * Auto-adjust batch size based on latency
   */
  private autoAdjustBatchSize(latency: number): void {
    if (latency > this.AUTO_ADJUST_THRESHOLD.HIGH_LATENCY_MS) {
      // Reduce batch size if latency is too high
      const newSize = Math.max(10, Math.floor(this.currentBatchSize * 0.8));
      if (newSize !== this.currentBatchSize) {
        this.logger.info('Auto-adjusting batch size down', {
          from: this.currentBatchSize,
          to: newSize,
          reason: 'high_latency',
          latency
        });
        this.currentBatchSize = newSize;
        this.emit('config_change', { batchSize: newSize });
      }
    } else if (latency < this.AUTO_ADJUST_THRESHOLD.LOW_LATENCY_MS) {
      // Increase batch size if latency is low
      const newSize = Math.min(500, Math.floor(this.currentBatchSize * 1.2));
      if (newSize !== this.currentBatchSize) {
        this.logger.info('Auto-adjusting batch size up', {
          from: this.currentBatchSize,
          to: newSize,
          reason: 'low_latency',
          latency
        });
        this.currentBatchSize = newSize;
        this.emit('config_change', { batchSize: newSize });
      }
    }
  }

  /**
   * Auto-adjust concurrency based on queue depth
   */
  private autoAdjustConcurrency(queueDepth: number): void {
    if (queueDepth > this.AUTO_ADJUST_THRESHOLD.QUEUE_DEPTH_HIGH) {
      // Increase concurrency if queue is deep
      const newConcurrency = Math.min(20, this.currentConcurrency + 1);
      if (newConcurrency !== this.currentConcurrency) {
        this.logger.info('Auto-adjusting concurrency up', {
          from: this.currentConcurrency,
          to: newConcurrency,
          reason: 'high_queue_depth',
          queueDepth
        });
        this.currentConcurrency = newConcurrency;
        this.emit('config_change', { concurrency: newConcurrency });
      }
    } else if (queueDepth < this.AUTO_ADJUST_THRESHOLD.QUEUE_DEPTH_LOW) {
      // Decrease concurrency if queue is shallow
      const newConcurrency = Math.max(1, this.currentConcurrency - 1);
      if (newConcurrency !== this.currentConcurrency) {
        this.logger.info('Auto-adjusting concurrency down', {
          from: this.currentConcurrency,
          to: newConcurrency,
          reason: 'low_queue_depth',
          queueDepth
        });
        this.currentConcurrency = newConcurrency;
        this.emit('config_change', { concurrency: newConcurrency });
      }
    }
  }

  /**
   * Check if error rate exceeds threshold
   */
  checkErrorThreshold(): boolean {
    const errorRate = this.calculateErrorRate();
    if (errorRate > this.AUTO_ADJUST_THRESHOLD.HIGH_ERROR_RATE) {
      this.logger.warn('High error rate detected', {
        errorRate,
        threshold: this.AUTO_ADJUST_THRESHOLD.HIGH_ERROR_RATE
      });
      this.emit('alert', {
        type: 'high_error_rate',
        value: errorRate,
        threshold: this.AUTO_ADJUST_THRESHOLD.HIGH_ERROR_RATE
      });
      return true;
    }
    return false;
  }

  /**
   * Flush metrics to database
   */
  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;
    
    try {
      const snapshot = this.getMetricsSnapshot();
      
      // Store in indexing_stats table
      const { error } = await this.supabase
        .from('indexing_stats')
        .insert({
          workspace_id: '00000000-0000-0000-0000-000000000000', // System-wide metrics
          entity_type: 'system',
          total_indexed: this.metricsBuffer.filter(m => m.type === 'task_completed').length,
          total_failed: this.metricsBuffer.filter(m => m.type === 'task_failed').length,
          total_retried: 0, // Will be updated by retry mechanism
          avg_processing_time_ms: snapshot.latency.avg,
          p95_processing_time_ms: snapshot.latency.p95,
          p99_processing_time_ms: snapshot.latency.p99,
          hour_bucket: new Date(Math.floor(Date.now() / 3600000) * 3600000) // Round to hour
        });
      
      if (error) {
        this.logger.error('Failed to flush metrics to database', error);
      }
      
      // Clear buffer
      this.metricsBuffer = [];
      
    } catch (error) {
      this.logger.error('Error flushing metrics', error);
    }
  }

  /**
   * Trim metric arrays to prevent memory bloat
   */
  private trimMetricArray(array: number[]): void {
    // Remove old samples beyond window
    const cutoffTime = Date.now() - this.METRIC_WINDOW_MS;
    
    // Keep only recent samples (simplified - in production, track timestamps)
    if (array.length > this.MAX_METRIC_SAMPLES) {
      array.splice(0, array.length - this.MAX_METRIC_SAMPLES);
    }
  }

  /**
   * Get recommended configuration based on metrics
   */
  getRecommendedConfig(): {
    batchSize: number;
    concurrency: number;
    reasons: string[];
  } {
    const snapshot = this.getMetricsSnapshot();
    const reasons: string[] = [];
    
    let recommendedBatchSize = this.currentBatchSize;
    let recommendedConcurrency = this.currentConcurrency;
    
    // Analyze latency
    if (snapshot.latency.p95 > this.AUTO_ADJUST_THRESHOLD.HIGH_LATENCY_MS) {
      recommendedBatchSize = Math.floor(this.currentBatchSize * 0.7);
      reasons.push(`High p95 latency (${snapshot.latency.p95}ms)`);
    }
    
    // Analyze queue depth
    if (this.metrics.queueDepth > this.AUTO_ADJUST_THRESHOLD.QUEUE_DEPTH_HIGH) {
      recommendedConcurrency = Math.min(20, this.currentConcurrency + 2);
      reasons.push(`High queue depth (${this.metrics.queueDepth})`);
    }
    
    // Analyze error rate
    const errorRate = this.calculateErrorRate();
    if (errorRate > this.AUTO_ADJUST_THRESHOLD.HIGH_ERROR_RATE) {
      recommendedBatchSize = Math.floor(recommendedBatchSize * 0.5);
      recommendedConcurrency = Math.max(1, recommendedConcurrency - 1);
      reasons.push(`High error rate (${(errorRate * 100).toFixed(2)}%)`);
    }
    
    return {
      batchSize: recommendedBatchSize,
      concurrency: recommendedConcurrency,
      reasons
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = {
      indexingLatency: [],
      batchSizes: [],
      errorRates: new Map(),
      throughput: 0,
      queueDepth: 0,
      processingTimes: new Map()
    };
    this.activeOperations.clear();
    this.metricsBuffer = [];
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flushMetrics();
    this.removeAllListeners();
  }
}

// Create singleton instance
export const indexingPerformanceMonitor = new IndexingPerformanceMonitor();