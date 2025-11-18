/**
 * FileUploadProgress Component
 *
 * Enhanced progress indicator for file uploads with detailed status,
 * progress bars, and error recovery options.
 */

import { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { cn } from '~/utils/cn';

interface FileUploadProgressProps {
  filename: string;
  progress: number;
  status: 'uploading' | 'parsing' | 'processing' | 'complete' | 'error';
  error?: string;
  fileSize?: number;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function FileUploadProgress({
  filename,
  progress,
  status,
  error,
  fileSize,
  onCancel,
  onRetry,
  onDismiss,
}: FileUploadProgressProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [autoHideTimer, setAutoHideTimer] = useState<NodeJS.Timeout | null>(null);

  // Auto-hide after completion
  useEffect(() => {
    if (status === 'complete') {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onDismiss?.();
      }, 3000);
      setAutoHideTimer(timer);
    }

    return () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer);
      }
    };
  }, [status, onDismiss, autoHideTimer]);

  if (!isVisible) return null;

  const statusMessages = {
    uploading: 'Uploading file...',
    parsing: 'Parsing data...',
    processing: 'Creating spreadsheet...',
    complete: 'Upload complete!',
    error: 'Upload failed'
  };

  const statusColors = {
    uploading: 'bg-blue-500',
    parsing: 'bg-indigo-500',
    processing: 'bg-purple-500',
    complete: 'bg-green-500',
    error: 'bg-red-500'
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <div className={cn(
        "bg-white dark:bg-gray-800 rounded-lg shadow-xl border",
        status === 'error' ? "border-red-400" : "border-gray-200 dark:border-gray-700"
      )}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {status === 'complete' ? (
                  <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : status === 'error' ? (
                  <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
                ) : (
                  <div className="relative">
                    <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
                <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {filename}
                </h3>
                {fileSize && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({formatFileSize(fileSize)})
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {statusMessages[status]}
              </p>
            </div>
            <button
              onClick={() => {
                setIsVisible(false);
                onDismiss?.();
              }}
              className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {status !== 'error' && (
          <div className="px-4 py-3">
            <div className="relative">
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                <span>{Math.round(progress)}%</span>
                {status === 'complete' ? (
                  <span className="text-green-600 dark:text-green-400">Complete</span>
                ) : (
                  <span className="capitalize">{status}</span>
                )}
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className={cn(
                    "h-2 rounded-full transition-all duration-300 ease-out",
                    statusColors[status]
                  )}
                  style={{ width: `${progress}%` }}
                >
                  {status !== 'complete' && (
                    <div className="h-full bg-white bg-opacity-30 animate-pulse" />
                  )}
                </div>
              </div>
            </div>

            {/* Detailed Status */}
            {status !== 'complete' && (
              <div className="mt-3 space-y-1">
                <div className={cn(
                  "flex items-center text-xs",
                  status === 'uploading' ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                )}>
                  <span className={cn(
                    "w-2 h-2 rounded-full mr-2",
                    status === 'uploading' ? "bg-blue-500 animate-pulse" : "bg-gray-300 dark:bg-gray-600"
                  )} />
                  Upload to server
                </div>
                <div className={cn(
                  "flex items-center text-xs",
                  status === 'parsing' ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400"
                )}>
                  <span className={cn(
                    "w-2 h-2 rounded-full mr-2",
                    status === 'parsing' ? "bg-indigo-500 animate-pulse" : "bg-gray-300 dark:bg-gray-600"
                  )} />
                  Parse file content
                </div>
                <div className={cn(
                  "flex items-center text-xs",
                  status === 'processing' ? "text-purple-600 dark:text-purple-400" : "text-gray-500 dark:text-gray-400"
                )}>
                  <span className={cn(
                    "w-2 h-2 rounded-full mr-2",
                    status === 'processing' ? "bg-purple-500 animate-pulse" : "bg-gray-300 dark:bg-gray-600"
                  )} />
                  Generate spreadsheet
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error State */}
        {status === 'error' && error && (
          <div className="px-4 py-3">
            <div className="bg-red-50 dark:bg-red-900 dark:bg-opacity-20 rounded-md p-3">
              <p className="text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            </div>
            <div className="mt-3 flex gap-2">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                >
                  <ArrowPathIcon className="w-4 h-4 mr-1.5" />
                  Retry Upload
                </button>
              )}
              <button
                onClick={() => {
                  setIsVisible(false);
                  onDismiss?.();
                }}
                className="flex-1 inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {status !== 'complete' && status !== 'error' && onCancel && (
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onCancel}
              className="w-full inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors"
            >
              Cancel Upload
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Minimal inline progress indicator
 */
export function FileUploadProgressInline({
  filename,
  progress,
  status,
}: Pick<FileUploadProgressProps, 'filename' | 'progress' | 'status'>) {
  const statusColors = {
    uploading: 'text-blue-600',
    parsing: 'text-indigo-600',
    processing: 'text-purple-600',
    complete: 'text-green-600',
    error: 'text-red-600'
  };

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-md">
      {status !== 'complete' && status !== 'error' ? (
        <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : status === 'complete' ? (
        <CheckCircleIcon className="h-4 w-4 text-green-500" />
      ) : (
        <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
      )}
      <span className={cn("text-sm font-medium", statusColors[status])}>
        {filename}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {Math.round(progress)}%
      </span>
    </div>
  );
}