import React, { Component, ErrorInfo, ReactNode } from 'react';
import { captureException } from '~/services/monitoring/sentry.client';
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: 'page' | 'component' | 'app';
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, level = 'component', componentName } = this.props;
    
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught error:', error, errorInfo);
    }

    // Capture exception with Sentry
    captureException(error, {
      level,
      componentName,
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
      errorCount: this.state.errorCount + 1,
    });

    // Call custom error handler if provided
    if (onError) {
      onError(error, errorInfo);
    }

    // Update state
    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1,
    }));

    // If too many errors, might be an infinite loop
    if (this.state.errorCount > 5) {
      console.error('Too many errors detected, possible infinite loop');
      captureException(new Error('Error boundary loop detected'), {
        originalError: error.message,
        errorCount: this.state.errorCount,
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
    });
  };

  render() {
    if (this.state.hasError) {
      const { fallback, level = 'component' } = this.props;
      const { error, errorInfo } = this.state;

      // Use custom fallback if provided
      if (fallback) {
        return <>{fallback}</>;
      }

      // Different UI based on error level
      if (level === 'app') {
        return (
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 dark:bg-red-900/20 rounded-full">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h1 className="mt-4 text-xl font-semibold text-center text-gray-900 dark:text-white">
                Application Error
              </h1>
              <p className="mt-2 text-sm text-center text-gray-600 dark:text-gray-400">
                Something went wrong. The error has been logged and our team has been notified.
              </p>
              {process.env.NODE_ENV === 'development' && error && (
                <details className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                  <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">
                    Error Details (Development Only)
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap text-red-600 dark:text-red-400">
                    {error.toString()}
                    {errorInfo?.componentStack}
                  </pre>
                </details>
              )}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => window.location.href = '/'}
                  className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Go Home
                </button>
                <button
                  onClick={this.handleReset}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowPathIcon className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            </div>
          </div>
        );
      }

      if (level === 'page') {
        return (
          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div className="flex-1">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                  Page Error
                </h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  This page encountered an error and cannot be displayed.
                </p>
                {process.env.NODE_ENV === 'development' && error && (
                  <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs text-red-700 dark:text-red-300">
                    {error.message}
                  </div>
                )}
                <button
                  onClick={this.handleReset}
                  className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Try reloading this section
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Component level error
      return (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Component Error
            </span>
          </div>
          <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
            This section could not be loaded
          </p>
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={this.handleReset}
              className="mt-2 text-xs text-yellow-600 dark:text-yellow-400 hover:underline"
            >
              Reset component
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for error handling in functional components
export function useErrorHandler() {
  return (error: Error, errorInfo?: { componentStack?: string }) => {
    captureException(error, {
      errorInfo,
      source: 'useErrorHandler',
    });
  };
}