import * as Sentry from '@sentry/remix';

export function initSentry() {
  // Only initialize in production or staging environments
  if (typeof window === 'undefined') return;
  
  const env = (window as any).ENV || {};
  
  if (env.NODE_ENV === 'development' && !env.ENABLE_SENTRY_DEV) {
    console.log('Sentry disabled in development');
    return;
  }

  if (!env.SENTRY_DSN) {
    console.log('Sentry DSN not configured');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV || 'development',
    integrations: [
      new Sentry.BrowserTracing({
        tracingOrigins: [
          'localhost',
          /^\//,
        ],
      }),
      new Sentry.Replay({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event, hint) {
      // Filter out specific errors if needed
      if (event.exception) {
        const error = hint.originalException as any;
        // Don't send network errors in development
        if (env.NODE_ENV === 'development' && error?.name === 'NetworkError') {
          return null;
        }
      }
      return event;
    },
  });

  // Capture user context
  Sentry.configureScope((scope) => {
    scope.setLevel('error');
    scope.setContext('app', {
      version: env.APP_VERSION || 'unknown',
      build: env.BUILD_ID || 'unknown',
    });
  });
}

export function captureException(error: Error, context?: Record<string, any>) {
  const env = (window as any).ENV || {};
  if (env.NODE_ENV === 'development' && !env.ENABLE_SENTRY_DEV) {
    console.error('Error captured (Sentry disabled):', error, context);
    return;
  }
  
  Sentry.withScope((scope) => {
    if (context) {
      Object.keys(context).forEach(key => {
        scope.setContext(key, context[key]);
      });
    }
    Sentry.captureException(error);
  });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  const env = (window as any).ENV || {};
  if (env.NODE_ENV === 'development' && !env.ENABLE_SENTRY_DEV) {
    console.log(`Message captured (${level}):`, message);
    return;
  }
  
  Sentry.captureMessage(message, level);
}

export function setUser(user: { id: string; email?: string; username?: string }) {
  Sentry.setUser(user);
}

export function clearUser() {
  Sentry.setUser(null);
}

export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
  Sentry.addBreadcrumb(breadcrumb);
}