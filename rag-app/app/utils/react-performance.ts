import { useRef, useCallback, useMemo, useEffect, DependencyList } from 'react';
import { areEqual } from 'react-window';

/**
 * React Performance Optimization Utilities
 * Provides advanced memoization and performance tracking for database blocks
 */

// Deep equality check for complex objects
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  
  return true;
}

// Shallow equality check for arrays
export function shallowArrayEqual<T>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  
  return true;
}

// Custom hook for memoizing expensive computations with dependency tracking
export function useExpensiveComputation<T>(
  computation: () => T,
  deps: DependencyList,
  options?: {
    equalityFn?: (prev: T, next: T) => boolean;
    debugLabel?: string;
  }
): T {
  const resultRef = useRef<T>();
  const depsRef = useRef<DependencyList>();
  const computeCount = useRef(0);
  
  const shouldRecompute = !depsRef.current || 
    !shallowArrayEqual(deps, depsRef.current);
  
  if (shouldRecompute) {
    const start = performance.now();
    const newResult = computation();
    const duration = performance.now() - start;
    
    const hasChanged = !resultRef.current || 
      (options?.equalityFn ? 
        !options.equalityFn(resultRef.current, newResult) : 
        resultRef.current !== newResult);
    
    if (hasChanged) {
      resultRef.current = newResult;
      computeCount.current++;
      
      if (options?.debugLabel && process.env.NODE_ENV === 'development') {
        console.debug(`[${options.debugLabel}] Recomputed (${computeCount.current}x, ${duration.toFixed(2)}ms)`);
      }
    }
    
    depsRef.current = deps;
  }
  
  return resultRef.current as T;
}

// Debounced callback hook with cancellation
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps: DependencyList = []
): [T, () => void] {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);
  
  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      cancel();
      
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay, cancel, ...deps]
  ) as T;
  
  useEffect(() => {
    return cancel;
  }, [cancel]);
  
  return [debouncedCallback, cancel];
}

// Throttled callback hook
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps: DependencyList = []
): T {
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  return useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallRef.current;
      
      if (timeSinceLastCall >= delay) {
        lastCallRef.current = now;
        callbackRef.current(...args);
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = setTimeout(() => {
          lastCallRef.current = Date.now();
          callbackRef.current(...args);
        }, delay - timeSinceLastCall);
      }
    },
    [delay, ...deps]
  ) as T;
}

// Performance monitoring hook
export function usePerformanceMonitor(componentName: string) {
  const renderCount = useRef(0);
  const lastRenderTime = useRef<number>();
  const renderTimes = useRef<number[]>([]);
  
  useEffect(() => {
    renderCount.current++;
    const now = performance.now();
    
    if (lastRenderTime.current) {
      const timeSinceLastRender = now - lastRenderTime.current;
      renderTimes.current.push(timeSinceLastRender);
      
      // Keep only last 100 render times
      if (renderTimes.current.length > 100) {
        renderTimes.current.shift();
      }
      
      // Log if render is too frequent
      if (timeSinceLastRender < 16 && process.env.NODE_ENV === 'development') {
        console.warn(`[${componentName}] Rapid re-render detected: ${timeSinceLastRender.toFixed(2)}ms`);
      }
    }
    
    lastRenderTime.current = now;
  });
  
  return {
    renderCount: renderCount.current,
    getAverageRenderTime: () => {
      if (renderTimes.current.length === 0) return 0;
      return renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length;
    },
    getRenderStats: () => ({
      count: renderCount.current,
      average: renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length,
      min: Math.min(...renderTimes.current),
      max: Math.max(...renderTimes.current)
    })
  };
}

// Memoized event handler creator
export function createMemoizedHandler<T extends (...args: any[]) => any>(
  handler: T,
  deps: DependencyList
): T {
  const handlerRef = useRef<T>();
  const depsRef = useRef<DependencyList>();
  
  if (!depsRef.current || !shallowArrayEqual(deps, depsRef.current)) {
    handlerRef.current = handler;
    depsRef.current = deps;
  }
  
  return handlerRef.current as T;
}

// Batch state updates helper
export class BatchedUpdates {
  private updates: Map<string, any> = new Map();
  private timeoutId: NodeJS.Timeout | null = null;
  private callback: (updates: Map<string, any>) => void;
  private delay: number;
  
  constructor(callback: (updates: Map<string, any>) => void, delay = 50) {
    this.callback = callback;
    this.delay = delay;
  }
  
  add(key: string, value: any) {
    this.updates.set(key, value);
    this.scheduleFlush();
  }
  
  private scheduleFlush() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    this.timeoutId = setTimeout(() => {
      this.flush();
    }, this.delay);
  }
  
  flush() {
    if (this.updates.size > 0) {
      const updatesCopy = new Map(this.updates);
      this.updates.clear();
      this.callback(updatesCopy);
    }
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
  
  clear() {
    this.updates.clear();
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

// Virtual list optimization helper
export interface VirtualListHelper<T> {
  getItemKey: (index: number, data: T[]) => string;
  getItemSize: (index: number) => number;
  estimatedItemSize: number;
  overscan: number;
}

export function createVirtualListHelper<T extends { id: string }>(
  options: Partial<VirtualListHelper<T>> = {}
): VirtualListHelper<T> {
  return {
    getItemKey: options.getItemKey || ((index, data) => data[index]?.id || `item-${index}`),
    getItemSize: options.getItemSize || (() => 40),
    estimatedItemSize: options.estimatedItemSize || 40,
    overscan: options.overscan || 5
  };
}

// React.memo comparison function for complex props
export function createPropsComparer<T extends Record<string, any>>(
  keysToCompare?: (keyof T)[],
  customComparers?: Partial<Record<keyof T, (a: any, b: any) => boolean>>
) {
  return (prevProps: T, nextProps: T): boolean => {
    const keys = keysToCompare || Object.keys(prevProps) as (keyof T)[];
    
    for (const key of keys) {
      const customComparer = customComparers?.[key];
      
      if (customComparer) {
        if (!customComparer(prevProps[key], nextProps[key])) {
          return false;
        }
      } else if (prevProps[key] !== nextProps[key]) {
        return false;
      }
    }
    
    return true;
  };
}

// Lazy component loader with error boundary
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  retries = 3,
  delay = 1000
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    let lastError: Error | undefined;
    
    for (let i = 0; i < retries; i++) {
      try {
        return await importFn();
      } catch (error) {
        lastError = error as Error;
        
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }
    
    throw lastError;
  });
}

// Export common comparison functions
export { areEqual } from 'react-window';

// Performance marks for profiling
export class PerformanceMarker {
  private marks: Map<string, number> = new Map();
  private measures: Map<string, number[]> = new Map();
  
  mark(name: string) {
    this.marks.set(name, performance.now());
  }
  
  measure(name: string, startMark: string, endMark?: string) {
    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : performance.now();
    
    if (start && end) {
      const duration = end - start;
      
      if (!this.measures.has(name)) {
        this.measures.set(name, []);
      }
      
      this.measures.get(name)!.push(duration);
      
      return duration;
    }
    
    return null;
  }
  
  getStats(measureName: string) {
    const measures = this.measures.get(measureName);
    
    if (!measures || measures.length === 0) {
      return null;
    }
    
    return {
      count: measures.length,
      total: measures.reduce((a, b) => a + b, 0),
      average: measures.reduce((a, b) => a + b, 0) / measures.length,
      min: Math.min(...measures),
      max: Math.max(...measures),
      p50: this.percentile(measures, 0.5),
      p95: this.percentile(measures, 0.95),
      p99: this.percentile(measures, 0.99)
    };
  }
  
  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }
  
  clear() {
    this.marks.clear();
    this.measures.clear();
  }
}