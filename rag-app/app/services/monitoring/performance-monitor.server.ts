import { performance } from 'perf_hooks';

/**
 * Performance monitoring service for database queries and API calls
 */

interface MetricEntry {
  name: string;
  duration: number;
  timestamp: Date;
  tags?: Record<string, string>;
  error?: boolean;
}

class PerformanceMonitor {
  private metrics: MetricEntry[] = [];
  private timers: Map<string, number> = new Map();
  private readonly maxMetrics = 1000;
  private readonly slowQueryThreshold = 100; // ms
  private readonly criticalQueryThreshold = 500; // ms

  /**
   * Start timing an operation
   */
  startTimer(operationId: string): void {
    this.timers.set(operationId, performance.now());
  }

  /**
   * End timing and record metric
   */
  endTimer(
    operationId: string,
    metricName: string,
    tags?: Record<string, string>
  ): number {
    const startTime = this.timers.get(operationId);
    if (!startTime) {
      console.warn(`No timer found for operation: ${operationId}`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(operationId);

    this.recordMetric({
      name: metricName,
      duration,
      timestamp: new Date(),
      tags
    });

    // Log slow operations
    if (duration > this.criticalQueryThreshold) {
      console.error(`CRITICAL: ${metricName} took ${duration.toFixed(2)}ms`, tags);
    } else if (duration > this.slowQueryThreshold) {
      console.warn(`SLOW: ${metricName} took ${duration.toFixed(2)}ms`, tags);
    }

    return duration;
  }

  /**
   * Record a metric
   */
  private recordMetric(metric: MetricEntry): void {
    this.metrics.push(metric);

    // Maintain max size
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Send to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      this.sendToMonitoringService(metric);
    }
  }

  /**
   * Measure async function performance
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const operationId = `${name}-${Date.now()}`;
    this.startTimer(operationId);

    try {
      const result = await fn();
      this.endTimer(operationId, name, tags);
      return result;
    } catch (error) {
      this.endTimer(operationId, name, { ...tags, error: 'true' });
      this.recordMetric({
        name: `${name}.error`,
        duration: 0,
        timestamp: new Date(),
        tags,
        error: true
      });
      throw error;
    }
  }

  /**
   * Get performance statistics
   */
  getStats(metricName?: string): {
    count: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
    slowQueries: number;
    criticalQueries: number;
  } {
    const relevantMetrics = metricName
      ? this.metrics.filter(m => m.name === metricName)
      : this.metrics;

    if (relevantMetrics.length === 0) {
      return {
        count: 0,
        avg: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        slowQueries: 0,
        criticalQueries: 0
      };
    }

    const durations = relevantMetrics.map(m => m.duration).sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    
    const percentile = (p: number) => {
      const index = Math.ceil((p / 100) * durations.length) - 1;
      return durations[index] || 0;
    };

    return {
      count: durations.length,
      avg: sum / durations.length,
      min: durations[0],
      max: durations[durations.length - 1],
      p50: percentile(50),
      p95: percentile(95),
      p99: percentile(99),
      slowQueries: durations.filter(d => d > this.slowQueryThreshold).length,
      criticalQueries: durations.filter(d => d > this.criticalQueryThreshold).length
    };
  }

  /**
   * Get recent slow queries
   */
  getSlowQueries(limit = 10): MetricEntry[] {
    return this.metrics
      .filter(m => m.duration > this.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.metrics = [];
    this.timers.clear();
  }

  /**
   * Send metrics to external monitoring service
   */
  private sendToMonitoringService(metric: MetricEntry): void {
    // TODO: Integrate with DataDog, New Relic, or custom monitoring
    // For now, just log in production
    if (process.env.MONITORING_ENABLED === 'true') {
      console.log('Metric:', JSON.stringify(metric));
    }
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): MetricEntry[] {
    return [...this.metrics];
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator for measuring function performance
 */
export function measurePerformance(name?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const metricName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return performanceMonitor.measure(
        metricName,
        () => originalMethod.apply(this, args),
        { method: propertyKey }
      );
    };

    return descriptor;
  };
}

/**
 * Express middleware for tracking request performance
 */
export function performanceMiddleware() {
  return (req: any, res: any, next: any) => {
    const operationId = `request-${Date.now()}`;
    performanceMonitor.startTimer(operationId);

    // Override res.end to capture when response is sent
    const originalEnd = res.end;
    res.end = function (...args: any[]) {
      performanceMonitor.endTimer(operationId, 'http.request', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode.toString()
      });
      originalEnd.apply(res, args);
    };

    next();
  };
}

/**
 * Database query wrapper with performance tracking
 */
export async function trackQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>,
  metadata?: Record<string, string>
): Promise<T> {
  return performanceMonitor.measure(
    `db.${queryName}`,
    queryFn,
    metadata
  );
}

/**
 * Batch performance tracking
 */
export class BatchPerformanceTracker {
  private batchId: string;
  private operations: Map<string, number> = new Map();

  constructor(batchName: string) {
    this.batchId = `batch-${batchName}-${Date.now()}`;
    performanceMonitor.startTimer(this.batchId);
  }

  startOperation(operationName: string): void {
    const opId = `${this.batchId}-${operationName}`;
    performanceMonitor.startTimer(opId);
    this.operations.set(operationName, performance.now());
  }

  endOperation(operationName: string): void {
    const opId = `${this.batchId}-${operationName}`;
    performanceMonitor.endTimer(opId, `batch.operation.${operationName}`);
    this.operations.delete(operationName);
  }

  finish(): number {
    // End any remaining operations
    for (const [name] of this.operations) {
      this.endOperation(name);
    }

    return performanceMonitor.endTimer(this.batchId, 'batch.total');
  }
}