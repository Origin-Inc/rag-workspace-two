import { useEffect, useRef, useCallback } from 'react';
import { captureMessage } from '~/services/monitoring/sentry.client';

interface RenderMetrics {
  componentName: string;
  renderCount: number;
  lastRenderDuration: number;
  avgRenderDuration: number;
  totalRenderDuration: number;
  mountTime: number;
  unmountTime?: number;
  propsChanges: number;
  unnecessaryRenders: number;
}

class ComponentPerformanceTracker {
  private metrics = new Map<string, RenderMetrics>();
  private renderStartTimes = new Map<string, number>();

  startRender(componentName: string) {
    this.renderStartTimes.set(componentName, performance.now());
  }

  endRender(componentName: string, propsChanged: boolean) {
    const startTime = this.renderStartTimes.get(componentName);
    if (!startTime) return;

    const duration = performance.now() - startTime;
    const existing = this.metrics.get(componentName) || {
      componentName,
      renderCount: 0,
      lastRenderDuration: 0,
      avgRenderDuration: 0,
      totalRenderDuration: 0,
      mountTime: Date.now(),
      propsChanges: 0,
      unnecessaryRenders: 0,
    };

    existing.renderCount++;
    existing.lastRenderDuration = duration;
    existing.totalRenderDuration += duration;
    existing.avgRenderDuration = existing.totalRenderDuration / existing.renderCount;
    
    if (propsChanged) {
      existing.propsChanges++;
    } else if (existing.renderCount > 1) {
      existing.unnecessaryRenders++;
    }

    this.metrics.set(componentName, existing);
    this.renderStartTimes.delete(componentName);

    // Alert on slow renders
    if (duration > 16) { // More than one frame (60fps)
      console.warn(`Slow render detected in ${componentName}: ${duration.toFixed(2)}ms`);
    }

    // Alert on excessive re-renders
    if (existing.renderCount > 50 && existing.unnecessaryRenders / existing.renderCount > 0.5) {
      console.warn(`Excessive unnecessary renders in ${componentName}: ${existing.unnecessaryRenders}/${existing.renderCount}`);
      captureMessage(`Excessive re-renders: ${componentName}`, 'warning');
    }
  }

  getMetrics(componentName?: string): RenderMetrics[] {
    if (componentName) {
      const metric = this.metrics.get(componentName);
      return metric ? [metric] : [];
    }
    return Array.from(this.metrics.values());
  }

  clearMetrics(componentName?: string) {
    if (componentName) {
      this.metrics.delete(componentName);
    } else {
      this.metrics.clear();
    }
  }
}

const tracker = new ComponentPerformanceTracker();

// Make it globally available for debugging
if (typeof window !== 'undefined') {
  (window as any).componentTracker = tracker;
}

/**
 * Hook to monitor component render performance
 */
export function useRenderMonitor(componentName: string) {
  const renderCount = useRef(0);
  const prevPropsRef = useRef<any>();
  const mountTimeRef = useRef(Date.now());

  useEffect(() => {
    renderCount.current++;
    
    // Track render
    tracker.startRender(componentName);
    
    // Check if props changed
    const propsChanged = prevPropsRef.current !== undefined && 
                        JSON.stringify(prevPropsRef.current) !== JSON.stringify({});
    
    tracker.endRender(componentName, propsChanged);
    
    // Log excessive renders in development
    if (process.env.NODE_ENV === 'development' && renderCount.current > 20) {
      console.warn(`Component ${componentName} has rendered ${renderCount.current} times`);
    }
    
    return () => {
      // Component unmounting
      const metric = tracker.getMetrics(componentName)[0];
      if (metric) {
        metric.unmountTime = Date.now();
      }
    };
  });

  return {
    renderCount: renderCount.current,
    mountTime: mountTimeRef.current,
  };
}

/**
 * Hook to measure async operation performance
 */
export function useAsyncPerformance(operationName: string) {
  const measureOperation = useCallback(async <T,>(
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> => {
    const startTime = performance.now();
    
    try {
      const result = await operation();
      const duration = performance.now() - startTime;
      
      // Log slow operations
      if (duration > 1000) {
        console.warn(`Slow async operation "${operationName}": ${duration.toFixed(0)}ms`, metadata);
        
        if (duration > 5000) {
          captureMessage(`Very slow operation: ${operationName} (${duration.toFixed(0)}ms)`, 'warning');
        }
      }
      
      // Store metric
      if (typeof window !== 'undefined' && (window as any).asyncMetrics) {
        (window as any).asyncMetrics.record({
          operation: operationName,
          duration,
          success: true,
          timestamp: Date.now(),
          ...metadata,
        });
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      // Store error metric
      if (typeof window !== 'undefined' && (window as any).asyncMetrics) {
        (window as any).asyncMetrics.record({
          operation: operationName,
          duration,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
          ...metadata,
        });
      }
      
      throw error;
    }
  }, [operationName]);

  return measureOperation;
}

/**
 * Hook to monitor component mount/unmount performance
 */
export function useMountPerformance(componentName: string) {
  const mountTime = useRef<number>();
  
  useEffect(() => {
    mountTime.current = performance.now();
    console.log(`${componentName} mounted`);
    
    return () => {
      if (mountTime.current) {
        const lifetime = performance.now() - mountTime.current;
        console.log(`${componentName} unmounted after ${lifetime.toFixed(0)}ms`);
        
        // Track short-lived components (might indicate issues)
        if (lifetime < 100) {
          console.warn(`${componentName} had very short lifetime: ${lifetime.toFixed(0)}ms`);
        }
      }
    };
  }, [componentName]);
}

/**
 * Hook to monitor memory usage
 */
export function useMemoryMonitor(componentName: string, interval = 10000) {
  useEffect(() => {
    if (!(performance as any).memory) {
      console.log('Memory monitoring not available in this browser');
      return;
    }

    const checkMemory = () => {
      const memory = (performance as any).memory;
      const usedMB = memory.usedJSHeapSize / 1024 / 1024;
      const totalMB = memory.totalJSHeapSize / 1024 / 1024;
      const limitMB = memory.jsHeapSizeLimit / 1024 / 1024;
      
      console.log(`[${componentName}] Memory: ${usedMB.toFixed(1)}MB / ${totalMB.toFixed(1)}MB (limit: ${limitMB.toFixed(1)}MB)`);
      
      // Alert on high memory usage
      const usage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      if (usage > 80) {
        console.warn(`High memory usage in ${componentName}: ${usage.toFixed(1)}%`);
        captureMessage(`High memory usage: ${componentName} (${usage.toFixed(1)}%)`, 'warning');
      }
    };

    checkMemory(); // Initial check
    const intervalId = setInterval(checkMemory, interval);
    
    return () => clearInterval(intervalId);
  }, [componentName, interval]);
}

/**
 * Hook to track user interactions
 */
export function useInteractionTracking(componentName: string) {
  const trackInteraction = useCallback((
    action: string,
    metadata?: Record<string, any>
  ) => {
    const timestamp = Date.now();
    
    // Log interaction
    console.log(`[Interaction] ${componentName}.${action}`, metadata);
    
    // Store interaction metric
    if (typeof window !== 'undefined' && (window as any).interactionMetrics) {
      (window as any).interactionMetrics.record({
        component: componentName,
        action,
        timestamp,
        ...metadata,
      });
    }
    
    // Track in Sentry as breadcrumb
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.addBreadcrumb({
        category: 'ui.interaction',
        message: `${componentName}.${action}`,
        level: 'info',
        data: metadata,
      });
    }
  }, [componentName]);

  return trackInteraction;
}

export default tracker;