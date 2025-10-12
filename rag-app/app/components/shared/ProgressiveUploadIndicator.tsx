/**
 * Progressive Upload Indicator Component
 * Task #80.5: Add progressive loading indicators
 *
 * Displays a simple, clean progress bar for file uploads.
 * No technical details - just progress and status.
 */

import type { ProgressiveUploadState } from '~/hooks/useProgressiveFileUpload';

interface ProgressiveUploadIndicatorProps {
  state: ProgressiveUploadState;
  onCancel?: () => void;
  compact?: boolean;
}

export function ProgressiveUploadIndicator({
  state,
  onCancel,
  compact = false
}: ProgressiveUploadIndicatorProps) {

  // Don't show anything if idle
  if (state.status === 'idle') {
    return null;
  }

  // Compact mode: minimal progress indicator
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {state.status === 'uploading' && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-theme-text-secondary">Uploading...</span>
          </div>
        )}

        {state.status === 'processing' && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-theme-text-secondary">
              {state.loadedRows.toLocaleString()} / {state.totalRows.toLocaleString()} rows
            </span>
          </div>
        )}

        {state.status === 'complete' && (
          <div className="flex items-center gap-2 text-green-600">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Complete</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex items-center gap-2 text-red-600">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>Error</span>
          </div>
        )}
      </div>
    );
  }

  // Full mode: simple progress bar
  return (
    <div className="border border-theme-border rounded-lg p-3 bg-theme-bg-secondary space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-theme-text-primary">
            {state.status === 'uploading' && 'Uploading...'}
            {state.status === 'processing' && 'Processing...'}
            {state.status === 'complete' && 'Complete'}
            {state.status === 'error' && 'Failed'}
          </span>

          {(state.status === 'uploading' || state.status === 'processing') && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}

          {state.status === 'complete' && (
            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          )}

          {state.status === 'error' && (
            <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>

        {onCancel && (state.status === 'uploading' || state.status === 'processing') && (
          <button
            onClick={onCancel}
            className="text-xs text-theme-text-tertiary hover:text-theme-text-primary transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {(state.status === 'uploading' || state.status === 'processing') && (
        <div className="space-y-1">
          <div className="w-full bg-theme-bg-tertiary rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${state.progress}%` }}
            />
          </div>
          <div className="text-center">
            <span className="text-xs text-theme-text-secondary">{state.progress}%</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {state.status === 'error' && state.error && (
        <div className="text-xs text-red-600 dark:text-red-400">
          {state.error.message}
        </div>
      )}
    </div>
  );
}

/**
 * Mini progress indicator for inline display
 */
export function ProgressiveUploadMini({ state }: { state: ProgressiveUploadState }) {
  if (state.status === 'idle') return null;

  return (
    <div className="inline-flex items-center gap-2 px-2 py-1 bg-theme-bg-secondary rounded text-xs">
      {(state.status === 'uploading' || state.status === 'processing') && (
        <>
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-theme-text-secondary">{state.progress}%</span>
        </>
      )}

      {state.status === 'complete' && (
        <>
          <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-green-600">Complete</span>
        </>
      )}

      {state.status === 'error' && (
        <>
          <svg className="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-red-600">Failed</span>
        </>
      )}
    </div>
  );
}
