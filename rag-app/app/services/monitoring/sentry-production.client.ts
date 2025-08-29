import * as Sentry from '@sentry/remix';
import { BrowserTracing } from '@sentry/tracing';

interface SentryConfig {
  dsn?: string;
  environment?: string;
  userId?: string;
  workspaceId?: string;
  projectId?: string;
}

export function initSentry(config?: SentryConfig) {
  if (typeof window !== 'undefined') {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const isProduction = process.env.NODE_ENV === 'production';
    
    Sentry.init({
      dsn: config?.dsn || process.env.SENTRY_DSN || 'https://example@sentry.io/project-id',
      environment: config?.environment || process.env.NODE_ENV,
      enabled: isProduction, // Only enable in production
      
      integrations: [
        new BrowserTracing({
          // Set sampling to capture 100% of transactions for performance monitoring
          tracingOrigins: ['localhost', /^\//],
          // Track interactions (clicks, scrolls, etc.)
          routingInstrumentation: Sentry.remixRouterInstrumentation(
            // @ts-ignore - Remix router instrumentation
            window.__remixRouter
          ),
        }),
        new Sentry.Replay({
          maskAllText: false, // Don't mask text in development
          blockAllMedia: true,
          // Capture console logs and errors
          networkDetailAllowUrls: ['/api', '/app'],
          networkCaptureBodies: true,
          networkRequestHeaders: ['X-Workspace-Id', 'X-Project-Id'],
        }),
      ],
      
      // Performance Monitoring
      tracesSampleRate: isDevelopment ? 1.0 : 0.1, // 100% in dev, 10% in production
      
      // Session Replay
      replaysSessionSampleRate: isDevelopment ? 1.0 : 0.1, // 100% in dev, 10% in production
      replaysOnErrorSampleRate: 1.0, // Always capture on errors
      
      // Release tracking
      release: process.env.COMMIT_SHA || 'development',
      
      // User context
      initialScope: {
        tags: {
          component: 'frontend',
        },
        user: config?.userId ? {
          id: config.userId,
        } : undefined,
        context: {
          workspace: {
            id: config?.workspaceId,
          },
          project: {
            id: config?.projectId,
          },
        },
      },
      
      // Error filtering
      beforeSend(event, hint) {
        // Filter out non-critical errors
        if (event.exception) {
          const error = hint.originalException as Error;
          
          // Ignore network errors that are expected
          if (error?.message?.includes('NetworkError')) {
            return null;
          }
          
          // Ignore canceled requests
          if (error?.message?.includes('AbortError')) {
            return null;
          }
          
          // Add additional context
          event.extra = {
            ...event.extra,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent,
          };
        }
        
        return event;
      },
      
      // Breadcrumb filtering
      beforeBreadcrumb(breadcrumb) {
        // Filter out noisy breadcrumbs
        if (breadcrumb.category === 'console' && breadcrumb.level === 'debug') {
          return null;
        }
        
        // Add more context to navigation breadcrumbs
        if (breadcrumb.category === 'navigation') {
          breadcrumb.data = {
            ...breadcrumb.data,
            timestamp: new Date().toISOString(),
          };
        }
        
        return breadcrumb;
      },
    });
    
    // Set up performance monitoring for Core Web Vitals
    if (isProduction) {
      setupWebVitalsTracking();
    }
  }
}

/**
 * Track Core Web Vitals
 */
function setupWebVitalsTracking() {
  // Dynamically import web-vitals to reduce bundle size
  import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
    getCLS((metric) => {
      Sentry.captureMessage(`CLS: ${metric.value}`, 'info');
      trackMetric('CLS', metric.value);
    });
    
    getFID((metric) => {
      Sentry.captureMessage(`FID: ${metric.value}`, 'info');
      trackMetric('FID', metric.value);
    });
    
    getFCP((metric) => {
      Sentry.captureMessage(`FCP: ${metric.value}`, 'info');
      trackMetric('FCP', metric.value);
    });
    
    getLCP((metric) => {
      Sentry.captureMessage(`LCP: ${metric.value}`, 'info');
      trackMetric('LCP', metric.value);
      
      // Alert if LCP is too high
      if (metric.value > 2500) {
        Sentry.captureMessage('High LCP detected', 'warning');
      }
    });
    
    getTTFB((metric) => {
      Sentry.captureMessage(`TTFB: ${metric.value}`, 'info');
      trackMetric('TTFB', metric.value);
    });
  });
}

/**
 * Track custom metrics
 */
export function trackMetric(name: string, value: number, unit: string = 'ms') {
  Sentry.captureMessage(`Metric: ${name}`, {
    level: 'info',
    extra: {
      metric: name,
      value,
      unit,
      timestamp: Date.now(),
    },
  });
}

/**
 * Track user interactions
 */
export function trackInteraction(action: string, category: string, label?: string, value?: number) {
  Sentry.addBreadcrumb({
    category: 'user-interaction',
    message: `${category}: ${action}`,
    level: 'info',
    data: {
      action,
      category,
      label,
      value,
    },
  });
}

/**
 * Capture custom errors with context
 */
export function captureError(error: Error, context?: Record<string, any>) {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('custom', context);
    }
    Sentry.captureException(error);
  });
}

/**
 * Profile performance of async operations
 */
export async function profileOperation<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  const transaction = Sentry.startTransaction({
    name,
    op: 'custom',
  });
  
  Sentry.getCurrentHub().configureScope((scope) => scope.setSpan(transaction));
  
  const startTime = performance.now();
  
  try {
    const result = await operation();
    const duration = performance.now() - startTime;
    
    transaction.setStatus('ok');
    trackMetric(`operation.${name}`, duration);
    
    // Alert if operation is slow
    if (duration > 3000) {
      Sentry.captureMessage(`Slow operation: ${name} took ${duration}ms`, 'warning');
    }
    
    return result;
  } catch (error) {
    transaction.setStatus('internal_error');
    throw error;
  } finally {
    transaction.finish();
  }
}