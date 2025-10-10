/**
 * Progressive Upload Indicator Component
 * Task #80.5: Add progressive loading indicators and memory optimization
 *
 * Displays real-time progress for large file uploads with chunked loading.
 * Shows progress bar, chunk info, memory usage, and allows cancellation.
 */

import { useEffect, useState } from 'react';
import { getDuckDB } from '~/services/duckdb/duckdb-service.client';
import type { ProgressiveUploadState } from '~/hooks/useProgressiveFileUpload';

interface ProgressiveUploadIndicatorProps {
  state: ProgressiveUploadState;
  onCancel?: () => void;
  showMemoryUsage?: boolean;
  compact?: boolean;
}

export function ProgressiveUploadIndicator({
  state,
  onCancel,
  showMemoryUsage = true,
  compact = false
}: ProgressiveUploadIndicatorProps) {
  const [memoryUsage, setMemoryUsage] = useState<{ tableCount: number; estimatedMB: number } | null>(
    null
  );

  // Monitor memory usage
  useEffect(() => {
    if (!showMemoryUsage || state.status !== 'processing') return;

    const interval = setInterval(async () => {
      try {
        const duckdb = getDuckDB();
        if (duckdb.isReady()) {
          const usage = await duckdb.getMemoryUsage();
          setMemoryUsage(usage);
        }
      } catch (error) {
        console.error('Failed to get memory usage:', error);
      }
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [showMemoryUsage, state.status]);

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

  // Full mode: detailed progress indicator
  return (
    <div className="border border-theme-border rounded-lg p-4 bg-theme-bg-secondary space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-theme-text-primary">
            {state.status === 'uploading' && 'Uploading File'}
            {state.status === 'processing' && 'Processing Data'}
            {state.status === 'complete' && 'Upload Complete'}
            {state.status === 'error' && 'Upload Failed'}
          </h3>

          {(state.status === 'uploading' || state.status === 'processing') && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}

          {state.status === 'complete' && (
            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          )}

          {state.status === 'error' && (
            <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
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
            className="text-sm text-theme-text-tertiary hover:text-theme-text-primary transition-colors"
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
          <div className="flex justify-between text-xs text-theme-text-secondary">
            <span>{state.progress}%</span>
            {state.totalRows > 0 && (
              <span>
                {state.loadedRows.toLocaleString()} / {state.totalRows.toLocaleString()} rows
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {state.status !== 'error' && state.totalRows > 0 && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {/* Rows Loaded */}
          <div className="space-y-1">
            <div className="text-theme-text-tertiary">Rows Loaded</div>
            <div className="font-medium text-theme-text-primary">
              {state.loadedRows.toLocaleString()} / {state.totalRows.toLocaleString()}
            </div>
          </div>

          {/* Chunks Processed */}
          {state.totalChunks > 0 && (
            <div className="space-y-1">
              <div className="text-theme-text-tertiary">Chunks</div>
              <div className="font-medium text-theme-text-primary">
                {state.loadedChunks} / {state.totalChunks}
              </div>
            </div>
          )}

          {/* Memory Usage */}
          {showMemoryUsage && memoryUsage && state.status === 'processing' && (
            <>
              <div className="space-y-1">
                <div className="text-theme-text-tertiary">Memory Usage</div>
                <div className="font-medium text-theme-text-primary">
                  {memoryUsage.estimatedMB.toFixed(1)} MB
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-theme-text-tertiary">Tables</div>
                <div className="font-medium text-theme-text-primary">{memoryUsage.tableCount}</div>
              </div>
            </>
          )}

          {/* Table Name */}
          {state.tableName && (
            <div className="space-y-1 col-span-2">
              <div className="text-theme-text-tertiary">Table Name</div>
              <div className="font-mono text-sm text-theme-text-primary truncate">
                {state.tableName}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {state.status === 'error' && state.error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
          {state.error.message}
        </div>
      )}

      {/* Success Message */}
      {state.status === 'complete' && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-sm text-green-700 dark:text-green-400">
          Successfully loaded {state.loadedRows.toLocaleString()} rows into table "{state.tableName}"
        </div>
      )}

      {/* Performance Info */}
      {state.status === 'processing' && state.totalRows > 50000 && (
        <div className="text-xs text-theme-text-tertiary italic">
          Large file detected. Using progressive loading to optimize memory usage.
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
          <span className="text-theme-text-secondary">
            {state.progress}% ({state.loadedRows.toLocaleString()}/{state.totalRows.toLocaleString()})
          </span>
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
