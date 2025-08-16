import { onCLS, onFCP, onLCP, onTTFB, onINP, type Metric } from 'web-vitals';
import { captureMessage } from './sentry.client';

export interface PerformanceMetrics {
  cls?: number; // Cumulative Layout Shift
  fcp?: number; // First Contentful Paint
  lcp?: number; // Largest Contentful Paint
  ttfb?: number; // Time to First Byte
  inp?: number; // Interaction to Next Paint
  timestamp: number;
  url: string;
  userAgent: string;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private metricsBuffer: PerformanceMetrics[] = [];
  private bufferSize = 100;
  private sendInterval = 30000; // Send metrics every 30 seconds
  private intervalId?: NodeJS.Timeout;

  constructor() {
    this.metrics = this.createEmptyMetrics();
  }

  private createEmptyMetrics(): PerformanceMetrics {
    return {
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
    };
  }

  public init() {
    // Initialize Web Vitals monitoring
    onCLS(this.handleCLS.bind(this));
    onFCP(this.handleFCP.bind(this));
    onLCP(this.handleLCP.bind(this));
    onTTFB(this.handleTTFB.bind(this));
    onINP(this.handleINP.bind(this));

    // Monitor navigation timing
    this.monitorNavigationTiming();

    // Monitor resource timing
    this.monitorResourceTiming();

    // Start periodic sending of metrics
    this.startMetricsSending();

    // Monitor memory usage (if available)
    this.monitorMemoryUsage();
  }

  private handleCLS(metric: Metric) {
    this.metrics.cls = metric.value;
    this.checkThreshold('CLS', metric.value, 0.1, 0.25);
  }

  private handleFCP(metric: Metric) {
    this.metrics.fcp = metric.value;
    this.checkThreshold('FCP', metric.value, 1800, 3000);
  }


  private handleLCP(metric: Metric) {
    this.metrics.lcp = metric.value;
    this.checkThreshold('LCP', metric.value, 2500, 4000);
  }

  private handleTTFB(metric: Metric) {
    this.metrics.ttfb = metric.value;
    this.checkThreshold('TTFB', metric.value, 800, 1800);
  }

  private handleINP(metric: Metric) {
    this.metrics.inp = metric.value;
    this.checkThreshold('INP', metric.value, 200, 500);
  }

  private checkThreshold(metricName: string, value: number, goodThreshold: number, poorThreshold: number) {
    let rating: 'good' | 'needs-improvement' | 'poor';
    
    if (value <= goodThreshold) {
      rating = 'good';
    } else if (value <= poorThreshold) {
      rating = 'needs-improvement';
    } else {
      rating = 'poor';
    }

    // Log poor performance metrics
    if (rating === 'poor') {
      console.warn(`Poor ${metricName} performance: ${value}ms`);
      captureMessage(`Poor ${metricName} performance: ${value}ms`, 'warning');
    }

    // Store metric with rating
    this.storeMetric({
      ...this.metrics,
      [`${metricName.toLowerCase()}_rating`]: rating,
    });
  }

  private monitorNavigationTiming() {
    if (!window.performance || !window.performance.timing) return;

    const timing = window.performance.timing;
    const navigationStart = timing.navigationStart;

    const metrics = {
      domContentLoaded: timing.domContentLoadedEventEnd - navigationStart,
      loadComplete: timing.loadEventEnd - navigationStart,
      domInteractive: timing.domInteractive - navigationStart,
      dnsLookup: timing.domainLookupEnd - timing.domainLookupStart,
      tcpConnection: timing.connectEnd - timing.connectStart,
      request: timing.responseStart - timing.requestStart,
      response: timing.responseEnd - timing.responseStart,
      domProcessing: timing.domComplete - timing.domLoading,
    };

    console.log('Navigation Timing:', metrics);
    this.storeMetric({
      ...this.metrics,
      navigationTiming: metrics,
    } as any);
  }

  private monitorResourceTiming() {
    if (!window.performance || !window.performance.getEntriesByType) return;

    const resources = window.performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    
    // Group resources by type
    const resourcesByType = resources.reduce((acc, resource) => {
      const type = this.getResourceType(resource.name);
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push({
        name: resource.name,
        duration: resource.duration,
        size: resource.transferSize || 0,
      });
      return acc;
    }, {} as Record<string, any[]>);

    // Calculate averages by type
    const averages = Object.entries(resourcesByType).reduce((acc, [type, resources]) => {
      const totalDuration = resources.reduce((sum, r) => sum + r.duration, 0);
      const totalSize = resources.reduce((sum, r) => sum + r.size, 0);
      acc[type] = {
        count: resources.length,
        avgDuration: totalDuration / resources.length,
        totalSize,
      };
      return acc;
    }, {} as Record<string, any>);

    console.log('Resource Timing Averages:', averages);
  }

  private getResourceType(url: string): string {
    if (url.match(/\.(js|jsx|ts|tsx)$/)) return 'script';
    if (url.match(/\.(css|scss|sass)$/)) return 'stylesheet';
    if (url.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|eot)$/)) return 'font';
    if (url.includes('/api/')) return 'api';
    return 'other';
  }

  private monitorMemoryUsage() {
    if (!(performance as any).memory) return;

    const memory = (performance as any).memory;
    const memoryMetrics = {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };

    // Check for memory leaks (heap growing too large)
    const heapUsagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
    if (heapUsagePercent > 90) {
      console.warn('High memory usage detected:', heapUsagePercent.toFixed(2) + '%');
      captureMessage(`High memory usage: ${heapUsagePercent.toFixed(2)}%`, 'warning');
    }

    console.log('Memory Usage:', memoryMetrics);
  }

  private storeMetric(metric: any) {
    this.metricsBuffer.push(metric);
    
    // Keep buffer size limited
    if (this.metricsBuffer.length > this.bufferSize) {
      this.metricsBuffer.shift();
    }
  }

  private startMetricsSending() {
    this.intervalId = setInterval(() => {
      this.sendMetrics();
    }, this.sendInterval);
  }

  private async sendMetrics() {
    if (this.metricsBuffer.length === 0) return;

    // In development, just log metrics instead of sending
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.log('[Metrics Buffer]', this.metricsBuffer.length, 'metrics collected');
      // Keep only last 50 metrics in dev to prevent memory issues
      if (this.metricsBuffer.length > 50) {
        this.metricsBuffer = this.metricsBuffer.slice(-50);
      }
      return;
    }

    try {
      // In production, send to your metrics endpoint
      const response = await fetch('/api/metrics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metrics: this.metricsBuffer,
          timestamp: Date.now(),
        }),
      });

      if (response?.ok) {
        // Clear buffer after successful send
        this.metricsBuffer = [];
      }
    } catch (error) {
      console.error('Failed to send metrics:', error);
    }
  }

  public getMetrics(): PerformanceMetrics[] {
    return [...this.metricsBuffer];
  }

  public getCurrentMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

export default performanceMonitor;