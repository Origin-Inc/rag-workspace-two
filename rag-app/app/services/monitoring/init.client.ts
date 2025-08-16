import performanceMonitor from './web-vitals.client';
import apiMonitor from './api-monitor.client';
import { initSentry } from './sentry.client';

/**
 * Initialize all monitoring services
 */
export function initMonitoring() {
  // Initialize Sentry error tracking
  // Note: You'll need to add SENTRY_DSN to your environment variables
  const env = (window as any).ENV || {};
  if (env.SENTRY_DSN) {
    initSentry();
  }

  // Initialize Web Vitals monitoring
  performanceMonitor.init();

  // API monitoring is auto-initialized when imported
  console.log('API monitoring initialized');

  // Set up global error handler
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    if ((window as any).Sentry) {
      (window as any).Sentry.captureException(event.reason);
    }
  });

  // Monitor long tasks (tasks that block the main thread for >50ms)
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 100) {
            console.warn(`Long task detected: ${entry.duration.toFixed(0)}ms`, entry);
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // Long task monitoring not supported
    }
  }

  // Log monitoring initialization
  console.log('%c✅ Performance monitoring initialized', 'color: green; font-weight: bold');
  
  if (env.NODE_ENV === 'development' || !env.NODE_ENV) {
    console.log('%cDeveloper metrics available at /dev/metrics', 'color: blue');
    console.log('Console commands:');
    console.log('  window.performanceMonitor - Web Vitals monitor');
    console.log('  window.apiMonitor - API performance monitor');
    console.log('  window.componentTracker - Component render tracker');
  }
}

/**
 * Clean up monitoring services
 */
export function cleanupMonitoring() {
  performanceMonitor.destroy();
  console.log('Monitoring services cleaned up');
}