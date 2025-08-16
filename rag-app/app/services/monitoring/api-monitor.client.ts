import { captureMessage } from './sentry.client';

interface APIMetric {
  endpoint: string;
  method: string;
  duration: number;
  status: number;
  timestamp: number;
  size?: number;
  error?: string;
}

interface APIStats {
  endpoint: string;
  method: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  errorCount: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
}

class APIMonitor {
  private metrics: APIMetric[] = [];
  private maxMetrics = 1000;
  private slowThreshold = 3000; // 3 seconds
  private errorThreshold = 0.05; // 5% error rate triggers alert

  constructor() {
    this.interceptFetch();
    this.interceptXMLHttpRequest();
  }

  private interceptFetch() {
    const originalFetch = window.fetch;
    
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const [resource, config] = args;
      const url = typeof resource === 'string' ? resource : resource.url;
      const method = config?.method || 'GET';
      
      try {
        const response = await originalFetch(...args);
        const duration = performance.now() - startTime;
        
        // Clone response to read body size
        const clonedResponse = response.clone();
        const blob = await clonedResponse.blob();
        const size = blob.size;
        
        this.recordMetric({
          endpoint: this.normalizeEndpoint(url),
          method,
          duration,
          status: response.status,
          timestamp: Date.now(),
          size,
        });
        
        // Alert on slow requests
        if (duration > this.slowThreshold) {
          this.handleSlowRequest(url, duration);
        }
        
        // Alert on errors
        if (!response.ok) {
          this.handleErrorResponse(url, response.status);
        }
        
        return response;
      } catch (error) {
        const duration = performance.now() - startTime;
        
        this.recordMetric({
          endpoint: this.normalizeEndpoint(url),
          method,
          duration,
          status: 0,
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : 'Network error',
        });
        
        throw error;
      }
    };
  }

  private interceptXMLHttpRequest() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method: string, url: string, ...args: any[]) {
      this._method = method;
      this._url = url;
      return originalOpen.apply(this, [method, url, ...args] as any);
    };
    
    XMLHttpRequest.prototype.send = function(...args: any[]) {
      const startTime = performance.now();
      const method = this._method || 'GET';
      const url = this._url;
      
      this.addEventListener('load', () => {
        const duration = performance.now() - startTime;
        
        const monitor = (window as any).apiMonitor;
        if (monitor) {
          monitor.recordMetric({
            endpoint: monitor.normalizeEndpoint(url),
            method,
            duration,
            status: this.status,
            timestamp: Date.now(),
            size: this.response?.length || 0,
          });
        }
      });
      
      this.addEventListener('error', () => {
        const duration = performance.now() - startTime;
        
        const monitor = (window as any).apiMonitor;
        if (monitor) {
          monitor.recordMetric({
            endpoint: monitor.normalizeEndpoint(url),
            method,
            duration,
            status: 0,
            timestamp: Date.now(),
            error: 'Network error',
          });
        }
      });
      
      return originalSend.apply(this, args);
    };
  }

  private normalizeEndpoint(url: string): string {
    try {
      const urlObj = new URL(url, window.location.origin);
      // Remove query params and normalize path
      let path = urlObj.pathname;
      
      // Replace IDs with placeholders
      path = path.replace(/\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/gi, '/:id');
      path = path.replace(/\/\d+/g, '/:id');
      
      return path;
    } catch {
      return url;
    }
  }

  private recordMetric(metric: APIMetric) {
    this.metrics.push(metric);
    
    // Keep metrics array size limited
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
    
    // Check for high error rates
    this.checkErrorRate(metric.endpoint);
  }

  private handleSlowRequest(url: string, duration: number) {
    console.warn(`Slow API request detected: ${url} took ${duration.toFixed(0)}ms`);
    captureMessage(`Slow API request: ${url} (${duration.toFixed(0)}ms)`, 'warning');
  }

  private handleErrorResponse(url: string, status: number) {
    if (status >= 500) {
      console.error(`Server error on ${url}: ${status}`);
      captureMessage(`Server error: ${url} returned ${status}`, 'error');
    }
  }

  private checkErrorRate(endpoint: string) {
    const recentMetrics = this.getRecentMetrics(endpoint, 100);
    if (recentMetrics.length < 10) return; // Need enough data
    
    const errorCount = recentMetrics.filter(m => m.status === 0 || m.status >= 400).length;
    const errorRate = errorCount / recentMetrics.length;
    
    if (errorRate > this.errorThreshold) {
      console.error(`High error rate for ${endpoint}: ${(errorRate * 100).toFixed(1)}%`);
      captureMessage(`High error rate: ${endpoint} (${(errorRate * 100).toFixed(1)}%)`, 'error');
    }
  }

  private getRecentMetrics(endpoint?: string, count = 100): APIMetric[] {
    let metrics = this.metrics.slice(-count);
    if (endpoint) {
      metrics = metrics.filter(m => m.endpoint === endpoint);
    }
    return metrics;
  }

  public getStats(endpoint?: string): APIStats[] {
    const grouped = new Map<string, APIMetric[]>();
    
    // Group metrics by endpoint and method
    for (const metric of this.metrics) {
      if (endpoint && metric.endpoint !== endpoint) continue;
      
      const key = `${metric.method} ${metric.endpoint}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(metric);
    }
    
    // Calculate stats for each group
    const stats: APIStats[] = [];
    for (const [key, metrics] of grouped.entries()) {
      const [method, ...endpointParts] = key.split(' ');
      const endpoint = endpointParts.join(' ');
      
      const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
      const errorCount = metrics.filter(m => m.status === 0 || m.status >= 400).length;
      
      stats.push({
        endpoint,
        method,
        count: metrics.length,
        totalDuration: durations.reduce((sum, d) => sum + d, 0),
        avgDuration: durations.reduce((sum, d) => sum + d, 0) / metrics.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        errorCount,
        errorRate: errorCount / metrics.length,
        p50: this.percentile(durations, 0.5),
        p95: this.percentile(durations, 0.95),
        p99: this.percentile(durations, 0.99),
      });
    }
    
    return stats.sort((a, b) => b.count - a.count);
  }

  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)] || 0;
  }

  public getMetrics(): APIMetric[] {
    return [...this.metrics];
  }

  public clearMetrics() {
    this.metrics = [];
  }

  public exportMetrics(): string {
    const stats = this.getStats();
    return JSON.stringify(stats, null, 2);
  }
}

// Create singleton instance
const apiMonitor = new APIMonitor();

// Make it globally available for debugging
if (typeof window !== 'undefined') {
  (window as any).apiMonitor = apiMonitor;
}

export default apiMonitor;