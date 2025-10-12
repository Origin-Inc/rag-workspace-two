/**
 * FileViewer Component
 * Task #81: Virtual Scrolling for Data Tables
 *
 * Displays uploaded data files using VirtualTable with DuckDB pagination.
 * Integrates Task 80 (Progressive Upload) with Task 81 (Virtual Scrolling).
 *
 * Features:
 * - Virtual scrolling for large datasets (1M+ rows)
 * - On-demand data loading via DuckDB pagination
 * - Schema-aware column formatting
 * - Progressive upload state display
 * - Error handling and loading states
 */

import { useEffect, useState, useMemo } from 'react';
import type { DataFile } from '~/atoms/chat-atoms';
import { VirtualTable, type VirtualTableColumn, type VirtualTableRow } from '~/components/shared/VirtualTable';
import { ProgressiveUploadIndicator } from '~/components/shared/ProgressiveUploadIndicator';
import { duckDBQuery } from '~/services/duckdb/duckdb-query.client';
import type { ProgressiveUploadState } from '~/hooks/useProgressiveFileUpload';

interface FileViewerProps {
  /** Data file to display */
  file: DataFile;

  /** Optional upload state (if file is still uploading) */
  uploadState?: ProgressiveUploadState;

  /** Container height (defaults to calc(100vh - 200px)) */
  height?: number | string;

  /** Whether to show row numbers */
  showRowNumbers?: boolean;

  /** Additional className */
  className?: string;
}

/**
 * Convert DataFile schema to VirtualTable columns
 */
function schemaToColumns(schema: DataFile['schema']): VirtualTableColumn[] {
  return schema.map(field => {
    // Infer column type from schema type
    let columnType: VirtualTableColumn['type'] = 'text';
    const schemaType = field.type.toLowerCase();

    if (schemaType.includes('int') || schemaType.includes('float') ||
        schemaType.includes('double') || schemaType.includes('decimal') ||
        schemaType.includes('numeric')) {
      columnType = 'number';
    } else if (schemaType.includes('date') || schemaType.includes('timestamp')) {
      columnType = 'date';
    } else if (schemaType.includes('bool')) {
      columnType = 'boolean';
    }

    return {
      id: field.name,
      name: field.name,
      type: columnType,
      width: 150, // Default width, could be adjusted based on type
      sortable: true,
    };
  });
}

/**
 * FileViewer Component
 *
 * Displays a data file using virtual scrolling with DuckDB pagination.
 */
export function FileViewer({
  file,
  uploadState,
  height = 'calc(100vh - 200px)',
  showRowNumbers = true,
  className,
}: FileViewerProps) {
  // State for data loading
  const [data, setData] = useState<VirtualTableRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [totalRows, setTotalRows] = useState<number>(file.rowCount);
  const [schema, setSchema] = useState(file.schema);

  // Convert schema to columns
  const columns = useMemo(() => {
    if (!schema || schema.length === 0) return [];
    return schemaToColumns(schema);
  }, [schema]);

  // Initial data load - fetch schema and data from DuckDB
  useEffect(() => {
    let mounted = true;

    const loadInitialData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load first page of data (100 rows)
        const result = await duckDBQuery.loadPage(
          file.tableName,
          0,
          100
        );

        if (!mounted) return;

        // Convert data to VirtualTableRow format
        const rows: VirtualTableRow[] = result.data.map((row, index) => ({
          id: `row-${index}`,
          ...row,
        }));

        setData(rows);
        setTotalRows(result.totalRows);

        // If schema not provided, infer it from the first row
        if (!file.schema || file.schema.length === 0) {
          if (rows.length > 0) {
            const firstRow = rows[0];
            const inferredSchema = Object.keys(firstRow)
              .filter(key => key !== 'id') // Exclude our added id field
              .map(key => ({
                name: key,
                type: typeof firstRow[key] === 'number' ? 'DOUBLE' :
                      typeof firstRow[key] === 'boolean' ? 'BOOLEAN' :
                      firstRow[key] instanceof Date ? 'TIMESTAMP' :
                      'VARCHAR',
                sampleData: [firstRow[key]]
              }));
            setSchema(inferredSchema);
          }
        }

        setIsLoading(false);
      } catch (err) {
        if (!mounted) return;
        console.error('Failed to load file data:', err);
        setError(err instanceof Error ? err : new Error('Failed to load file data'));
        setIsLoading(false);
      }
    };

    loadInitialData();

    return () => {
      mounted = false;
    };
  }, [file.tableName, file.schema]);

  // Pagination callback for virtual scrolling
  const handleLoadPage = async (offset: number, limit: number): Promise<VirtualTableRow[]> => {
    try {
      const result = await duckDBQuery.executeTablePaginated(
        file.tableName,
        offset,
        limit
      );

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to load data');
      }

      // Convert to VirtualTableRow format
      return result.data.map((row, index) => ({
        id: `row-${offset + index}`,
        ...row,
      }));
    } catch (err) {
      console.error('Failed to load page:', err);
      throw err;
    }
  };

  // Show upload progress if file is still uploading
  const isUploading = uploadState &&
    (uploadState.status === 'uploading' || uploadState.status === 'processing');

  return (
    <div className={className}>
      {/* File Header */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-theme-text-primary">
              {file.filename}
            </h2>
            <div className="mt-1 flex items-center gap-4 text-sm text-theme-text-secondary">
              <span>{totalRows.toLocaleString()} rows</span>
              <span>•</span>
              <span>{columns.length} columns</span>
              <span>•</span>
              <span>{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          </div>

          {/* Sync status badge */}
          {file.syncStatus && (
            <div className="flex items-center gap-2">
              {file.syncStatus === 'synced' && (
                <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/20 rounded">
                  Synced
                </span>
              )}
              {file.syncStatus === 'syncing' && (
                <span className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 rounded">
                  Syncing...
                </span>
              )}
              {file.syncStatus === 'failed' && (
                <span className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/20 rounded">
                  Sync Failed
                </span>
              )}
              {file.syncStatus === 'local-only' && (
                <span className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/20 rounded">
                  Local Only
                </span>
              )}
            </div>
          )}
        </div>

        {/* Upload progress indicator */}
        {isUploading && uploadState && (
          <ProgressiveUploadIndicator state={uploadState} />
        )}
      </div>

      {/* Virtual Table */}
      <VirtualTable
        columns={columns}
        data={data}
        totalRows={totalRows}
        onLoadPage={handleLoadPage}
        height={height}
        isLoading={isLoading}
        error={error}
        showRowNumbers={showRowNumbers}
        striped
        hoverable
      />

      {/* Schema Info (collapsible) */}
      {schema && schema.length > 0 && (
        <details className="mt-4 border border-theme-border rounded-lg">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-theme-text-secondary hover:bg-theme-bg-secondary transition-colors">
            Schema Information ({schema.length} columns)
          </summary>
          <div className="px-4 py-3 border-t border-theme-border">
            <div className="space-y-2">
              {schema.map((field, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b border-theme-border last:border-b-0"
                >
                  <span className="font-mono text-sm text-theme-text-primary">
                    {field.name}
                  </span>
                  <span className="text-xs text-theme-text-tertiary uppercase">
                    {field.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * FileViewer Error Boundary Wrapper
 *
 * Catches errors in FileViewer and displays them gracefully
 */
interface FileViewerErrorBoundaryProps {
  file: DataFile;
  uploadState?: ProgressiveUploadState;
  height?: number | string;
  showRowNumbers?: boolean;
  className?: string;
}

export function FileViewerWithErrorBoundary(props: FileViewerErrorBoundaryProps) {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // Reset error state when file changes
    setHasError(false);
    setErrorMessage('');
  }, [props.file.id]);

  if (hasError) {
    return (
      <div
        className="flex items-center justify-center border border-red-300 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/10"
        style={{ height: props.height || 'calc(100vh - 200px)' }}
      >
        <div className="flex flex-col items-center gap-3 px-6 py-4">
          <svg className="w-12 h-12 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-red-600 dark:text-red-400 font-medium">Failed to load file</span>
          {errorMessage && (
            <span className="text-sm text-red-500 dark:text-red-500 text-center max-w-md">
              {errorMessage}
            </span>
          )}
          <button
            onClick={() => {
              setHasError(false);
              setErrorMessage('');
            }}
            className="mt-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  try {
    return <FileViewer {...props} />;
  } catch (err) {
    setHasError(true);
    setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
    return null;
  }
}
