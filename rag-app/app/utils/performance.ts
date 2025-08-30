/**
 * Production-ready performance utilities
 */

/**
 * Debounce function to prevent excessive function calls
 * Helps reduce long task warnings
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function(...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function to limit function execution rate
 * Prevents performance issues from rapid state updates
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return function(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Request idle callback wrapper with fallback
 * Schedules non-critical work during idle periods
 */
export function requestIdleCallback(
  callback: () => void,
  options?: { timeout?: number }
): number {
  if ('requestIdleCallback' in window) {
    return (window as any).requestIdleCallback(callback, options);
  }
  // Fallback to setTimeout for browsers that don't support requestIdleCallback
  return window.setTimeout(callback, options?.timeout || 1);
}

/**
 * Cancel idle callback with fallback
 */
export function cancelIdleCallback(handle: number): void {
  if ('cancelIdleCallback' in window) {
    (window as any).cancelIdleCallback(handle);
  } else {
    window.clearTimeout(handle);
  }
}

/**
 * Break up long-running tasks to prevent blocking the main thread
 */
export async function chunkedTask<T>(
  items: T[],
  processor: (item: T) => void,
  chunkSize: number = 10
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    chunk.forEach(processor);
    
    // Yield to the browser to prevent long task warnings
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

/**
 * Measure performance of a function
 */
export function measurePerformance<T extends (...args: any[]) => any>(
  name: string,
  func: T
): T {
  return ((...args: Parameters<T>) => {
    const start = performance.now();
    const result = func(...args);
    const end = performance.now();
    
    if (end - start > 50) {
      console.warn(`[Performance] ${name} took ${(end - start).toFixed(2)}ms`);
    }
    
    return result;
  }) as T;
}