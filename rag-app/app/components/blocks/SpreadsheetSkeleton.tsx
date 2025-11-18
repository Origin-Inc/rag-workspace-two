/**
 * SpreadsheetSkeleton Component
 *
 * Skeleton/placeholder component shown during spreadsheet upload and processing.
 * Provides visual feedback while file is being parsed and converted.
 */

import { memo } from 'react';

interface SpreadsheetSkeletonProps {
  filename?: string;
  progress?: number;
  status?: 'uploading' | 'parsing' | 'processing' | 'complete';
}

export const SpreadsheetSkeleton = memo(function SpreadsheetSkeleton({
  filename,
  progress = 0,
  status = 'uploading',
}: SpreadsheetSkeletonProps) {
  const statusMessages = {
    uploading: 'Uploading file...',
    parsing: 'Parsing data...',
    processing: 'Creating spreadsheet...',
    complete: 'Complete!',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-4">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            {/* File icon */}
            <svg
              className="w-5 h-5 text-gray-400 animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>

            {/* Filename or placeholder */}
            <div className="h-5 bg-gray-200 rounded animate-pulse">
              {filename ? (
                <span className="text-sm font-medium text-gray-700 px-2">
                  {filename}
                </span>
              ) : (
                <div className="w-32 h-full" />
              )}
            </div>
          </div>

          {/* Status badge */}
          <div className="flex items-center space-x-2">
            {status !== 'complete' && (
              <svg
                className="animate-spin h-4 w-4 text-blue-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            <span className="text-sm text-gray-600">
              {statusMessages[status]}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        {progress > 0 && progress < 100 && (
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Skeleton table */}
      <div className="border border-gray-200 rounded-md overflow-hidden">
        {/* Header row */}
        <div className="bg-gray-50 border-b border-gray-200 p-2">
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((col) => (
              <div
                key={col}
                className="h-6 bg-gray-200 rounded animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Data rows */}
        <div className="divide-y divide-gray-100">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="p-2">
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((col) => (
                  <div
                    key={`${row}-${col}`}
                    className="h-5 bg-gray-100 rounded animate-pulse"
                    style={{
                      animationDelay: `${(row * 4 + col) * 50}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Loading message */}
      <div className="mt-4 text-center">
        <p className="text-xs text-gray-500">
          {status === 'uploading' && 'Uploading your file to the server...'}
          {status === 'parsing' && 'Analyzing file structure and data types...'}
          {status === 'processing' && 'Converting to interactive spreadsheet...'}
          {status === 'complete' && 'Spreadsheet ready!'}
        </p>
      </div>
    </div>
  );
});

/**
 * SpreadsheetSkeletonInline Component
 *
 * Compact inline skeleton for use in lists or tight spaces
 */
export const SpreadsheetSkeletonInline = memo(function SpreadsheetSkeletonInline() {
  return (
    <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-gray-50 rounded-md">
      <svg
        className="animate-spin h-4 w-4 text-gray-400"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="text-sm text-gray-600">Processing spreadsheet...</span>
    </div>
  );
});