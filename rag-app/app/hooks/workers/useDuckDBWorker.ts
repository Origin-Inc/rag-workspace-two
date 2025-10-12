/**
 * React hook for DuckDB Worker
 *
 * Provides a convenient API for interacting with the DuckDB Web Worker.
 * Handles worker lifecycle, message passing, and promise-based responses.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { DuckDBWorkerMessage, DuckDBWorkerResponse } from '~/workers/duckdb.worker';

export interface DuckDBWorkerHook {
  isReady: boolean;
  isInitializing: boolean;
  error: string | null;
  query: (sql: string) => Promise<{ data: any[]; columns: string[] }>;
  queryPaginated: (sql: string, offset: number, limit: number) => Promise<{ data: any[]; columns: string[] }>;
  getRowCount: (tableName: string) => Promise<number>;
  loadPage: (
    tableName: string,
    page: number,
    pageSize: number,
    orderBy?: string
  ) => Promise<{ data: any[]; totalRows: number; totalPages: number; hasMore: boolean }>;
  createTable: (tableName: string, columns: Array<{ name: string; type: string }>) => Promise<void>;
  insertRows: (tableName: string, rows: any[]) => Promise<void>;
  updateCell: (tableName: string, rowId: string, columnName: string, value: any) => Promise<void>;
  deleteRows: (tableName: string, rowIds: string[]) => Promise<void>;
}

/**
 * Hook for using DuckDB Worker
 */
export function useDuckDBWorker(): DuckDBWorkerHook {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store pending requests
  const pendingRequestsRef = useRef<
    Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>
  >(new Map());

  // Generate unique request ID
  const generateId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Initialize worker
  useEffect(() => {
    console.log('[DuckDBWorker] useEffect triggered', {
      hasWorker: !!workerRef.current,
      isInitializing
    });

    if (workerRef.current || isInitializing) {
      console.log('[DuckDBWorker] Skipping initialization - already initializing or worker exists');
      return;
    }

    console.log('[DuckDBWorker] Starting initialization...');
    setIsInitializing(true);

    try {
      // Create worker
      console.log('[DuckDBWorker] Creating worker with path: ../../workers/duckdb.worker.ts');
      const worker = new Worker(new URL('../../workers/duckdb.worker.ts', import.meta.url), {
        type: 'module',
      });

      console.log('[DuckDBWorker] Worker created successfully');
      workerRef.current = worker;

      // Handle messages from worker
      worker.onmessage = (event: MessageEvent<DuckDBWorkerResponse>) => {
        const response = event.data;
        console.log('[DuckDBWorker] Received message from worker:', response);

        switch (response.type) {
          case 'initialized':
            console.log('[DuckDBWorker] Initialization response:', {
              success: response.success,
              error: response.error
            });
            setIsInitializing(false);
            if (response.success) {
              console.log('[DuckDBWorker] ✅ Worker initialized successfully!');
              setIsReady(true);
              setError(null);
            } else {
              console.error('[DuckDBWorker] ❌ Initialization failed:', response.error);
              setError(response.error || 'Initialization failed');
            }
            break;

          case 'queryResult': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              if (response.success && response.data) {
                request.resolve({ data: response.data, columns: response.columns || [] });
              } else {
                request.reject(new Error(response.error || 'Query failed'));
              }
              pendingRequestsRef.current.delete(response.id);
            }
            break;
          }

          case 'rowCount': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              if (response.error) {
                request.reject(new Error(response.error));
              } else {
                request.resolve(response.count);
              }
              pendingRequestsRef.current.delete(response.id);
            }
            break;
          }

          case 'pageData': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              if (response.error) {
                request.reject(new Error(response.error));
              } else {
                request.resolve({
                  data: response.data,
                  totalRows: response.totalRows,
                  totalPages: response.totalPages,
                  hasMore: response.hasMore,
                });
              }
              pendingRequestsRef.current.delete(response.id);
            }
            break;
          }

          case 'operationComplete': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              if (response.success) {
                request.resolve(undefined);
              } else {
                request.reject(new Error(response.error || 'Operation failed'));
              }
              pendingRequestsRef.current.delete(response.id);
            }
            break;
          }
        }
      };

      worker.onerror = (error) => {
        console.error('[DuckDBWorker] ❌ Worker error event:', error);
        setError(`Worker error: ${error.message || 'Unknown error'}`);
        setIsInitializing(false);
        setIsReady(false);
      };

      // Initialize worker
      console.log('[DuckDBWorker] Sending initialize message to worker...');
      worker.postMessage({ type: 'initialize' } as DuckDBWorkerMessage);
    } catch (err) {
      console.error('[DuckDBWorker] ❌ Failed to create DuckDB worker:', err);
      setError(err instanceof Error ? err.message : 'Failed to create worker');
      setIsInitializing(false);
    }

    // Cleanup on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      pendingRequestsRef.current.clear();
    };
  }, [isInitializing]);

  // Execute SQL query
  const query = useCallback(
    async (sql: string): Promise<{ data: any[]; columns: string[] }> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'query',
          id,
          sql,
        } as DuckDBWorkerMessage);

        // Timeout after 30 seconds
        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Query timeout'));
          }
        }, 30000);
      });
    },
    [isReady, generateId]
  );

  // Execute paginated query
  const queryPaginated = useCallback(
    async (sql: string, offset: number, limit: number): Promise<{ data: any[]; columns: string[] }> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'queryPaginated',
          id,
          sql,
          offset,
          limit,
        } as DuckDBWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Query timeout'));
          }
        }, 30000);
      });
    },
    [isReady, generateId]
  );

  // Get row count
  const getRowCount = useCallback(
    async (tableName: string): Promise<number> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'getRowCount',
          id,
          tableName,
        } as DuckDBWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Row count timeout'));
          }
        }, 10000);
      });
    },
    [isReady, generateId]
  );

  // Load page
  const loadPage = useCallback(
    async (
      tableName: string,
      page: number,
      pageSize: number,
      orderBy?: string
    ): Promise<{ data: any[]; totalRows: number; totalPages: number; hasMore: boolean }> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'loadPage',
          id,
          tableName,
          page,
          pageSize,
          orderBy,
        } as DuckDBWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Load page timeout'));
          }
        }, 30000);
      });
    },
    [isReady, generateId]
  );

  // Create table
  const createTable = useCallback(
    async (tableName: string, columns: Array<{ name: string; type: string }>): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'createTable',
          id,
          tableName,
          columns,
        } as DuckDBWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Create table timeout'));
          }
        }, 10000);
      });
    },
    [isReady, generateId]
  );

  // Insert rows
  const insertRows = useCallback(
    async (tableName: string, rows: any[]): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'insertRows',
          id,
          tableName,
          rows,
        } as DuckDBWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Insert rows timeout'));
          }
        }, 30000);
      });
    },
    [isReady, generateId]
  );

  // Update cell
  const updateCell = useCallback(
    async (tableName: string, rowId: string, columnName: string, value: any): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'updateCell',
          id,
          tableName,
          rowId,
          columnName,
          value,
        } as DuckDBWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Update cell timeout'));
          }
        }, 10000);
      });
    },
    [isReady, generateId]
  );

  // Delete rows
  const deleteRows = useCallback(
    async (tableName: string, rowIds: string[]): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'deleteRows',
          id,
          tableName,
          rowIds,
        } as DuckDBWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Delete rows timeout'));
          }
        }, 10000);
      });
    },
    [isReady, generateId]
  );

  return {
    isReady,
    isInitializing,
    error,
    query,
    queryPaginated,
    getRowCount,
    loadPage,
    createTable,
    insertRows,
    updateCell,
    deleteRows,
  };
}
