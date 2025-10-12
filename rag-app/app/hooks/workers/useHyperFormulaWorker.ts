/**
 * React hook for HyperFormula Worker
 *
 * Provides a convenient API for interacting with the HyperFormula Web Worker.
 * Handles formula calculations, cell updates, and sheet operations.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { HyperFormulaWorkerMessage, HyperFormulaWorkerResponse } from '~/workers/hyperformula.worker';
import type { DetailedCellError } from 'hyperformula';

export interface HyperFormulaWorkerHook {
  isReady: boolean;
  isInitializing: boolean;
  error: string | null;
  setCellContents: (sheetId: number, row: number, col: number, content: any) => Promise<void>;
  setCellFormula: (sheetId: number, row: number, col: number, formula: string) => Promise<void>;
  getCellValue: (sheetId: number, row: number, col: number) => Promise<any>;
  getCellFormula: (sheetId: number, row: number, col: number) => Promise<string | null>;
  getSheetValues: (sheetId: number, startRow: number, endRow: number, startCol: number, endCol: number) => Promise<any[][]>;
  addSheet: (sheetName?: string) => Promise<number>;
  removeSheet: (sheetId: number) => Promise<void>;
  setSheetContent: (sheetId: number, data: any[][]) => Promise<void>;
  addRows: (sheetId: number, index: number, count: number) => Promise<void>;
  removeRows: (sheetId: number, index: number, count: number) => Promise<void>;
  addColumns: (sheetId: number, index: number, count: number) => Promise<void>;
  removeColumns: (sheetId: number, index: number, count: number) => Promise<void>;
}

/**
 * Hook for using HyperFormula Worker
 */
export function useHyperFormulaWorker(config?: any): HyperFormulaWorkerHook {
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
    if (workerRef.current || isInitializing) return;

    setIsInitializing(true);

    try {
      // Create worker
      const worker = new Worker(new URL('~/workers/hyperformula.worker.ts', import.meta.url), {
        type: 'module',
      });

      workerRef.current = worker;

      // Handle messages from worker
      worker.onmessage = (event: MessageEvent<HyperFormulaWorkerResponse>) => {
        const response = event.data;

        switch (response.type) {
          case 'initialized':
            setIsInitializing(false);
            if (response.success) {
              setIsReady(true);
              setError(null);
            } else {
              setError(response.error || 'Initialization failed');
            }
            break;

          case 'cellValue': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              if (response.error) {
                request.reject(response.error);
              } else {
                request.resolve(response.value);
              }
              pendingRequestsRef.current.delete(response.id);
            }
            break;
          }

          case 'cellFormula': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              if (response.error) {
                request.reject(new Error(response.error));
              } else {
                request.resolve(response.formula);
              }
              pendingRequestsRef.current.delete(response.id);
            }
            break;
          }

          case 'sheetValues': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              if (response.error) {
                request.reject(new Error(response.error));
              } else {
                request.resolve(response.values);
              }
              pendingRequestsRef.current.delete(response.id);
            }
            break;
          }

          case 'sheetAdded': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              if (response.error) {
                request.reject(new Error(response.error));
              } else {
                request.resolve(response.sheetId);
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

          case 'batchComplete': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              if (response.error) {
                request.reject(new Error(response.error));
              } else {
                request.resolve(response.results);
              }
              pendingRequestsRef.current.delete(response.id);
            }
            break;
          }
        }
      };

      worker.onerror = (error) => {
        console.error('HyperFormula Worker error:', error);
        setError('Worker error occurred');
        setIsInitializing(false);
      };

      // Initialize worker
      worker.postMessage({ type: 'initialize', config } as HyperFormulaWorkerMessage);
    } catch (err) {
      console.error('Failed to create HyperFormula worker:', err);
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
  }, [config, isInitializing]);

  // Set cell contents
  const setCellContents = useCallback(
    async (sheetId: number, row: number, col: number, content: any): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'setCellContents',
          id,
          sheetId,
          row,
          col,
          content,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Set cell contents timeout'));
          }
        }, 5000);
      });
    },
    [isReady, generateId]
  );

  // Set cell formula
  const setCellFormula = useCallback(
    async (sheetId: number, row: number, col: number, formula: string): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'setCellFormula',
          id,
          sheetId,
          row,
          col,
          formula,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Set cell formula timeout'));
          }
        }, 5000);
      });
    },
    [isReady, generateId]
  );

  // Get cell value
  const getCellValue = useCallback(
    async (sheetId: number, row: number, col: number): Promise<any> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'getCellValue',
          id,
          sheetId,
          row,
          col,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Get cell value timeout'));
          }
        }, 5000);
      });
    },
    [isReady, generateId]
  );

  // Get cell formula
  const getCellFormula = useCallback(
    async (sheetId: number, row: number, col: number): Promise<string | null> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'getCellFormula',
          id,
          sheetId,
          row,
          col,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Get cell formula timeout'));
          }
        }, 5000);
      });
    },
    [isReady, generateId]
  );

  // Get sheet values (for range)
  const getSheetValues = useCallback(
    async (
      sheetId: number,
      startRow: number,
      endRow: number,
      startCol: number,
      endCol: number
    ): Promise<any[][]> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'getSheetValues',
          id,
          sheetId,
          startRow,
          endRow,
          startCol,
          endCol,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Get sheet values timeout'));
          }
        }, 10000);
      });
    },
    [isReady, generateId]
  );

  // Add sheet
  const addSheet = useCallback(
    async (sheetName?: string): Promise<number> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'addSheet',
          id,
          sheetName,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Add sheet timeout'));
          }
        }, 5000);
      });
    },
    [isReady, generateId]
  );

  // Remove sheet
  const removeSheet = useCallback(
    async (sheetId: number): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'removeSheet',
          id,
          sheetId,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Remove sheet timeout'));
          }
        }, 5000);
      });
    },
    [isReady, generateId]
  );

  // Set sheet content
  const setSheetContent = useCallback(
    async (sheetId: number, data: any[][]): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'setSheetContent',
          id,
          sheetId,
          data,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Set sheet content timeout'));
          }
        }, 30000);
      });
    },
    [isReady, generateId]
  );

  // Add rows
  const addRows = useCallback(
    async (sheetId: number, index: number, count: number): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'addRows',
          id,
          sheetId,
          index,
          count,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Add rows timeout'));
          }
        }, 10000);
      });
    },
    [isReady, generateId]
  );

  // Remove rows
  const removeRows = useCallback(
    async (sheetId: number, index: number, count: number): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'removeRows',
          id,
          sheetId,
          index,
          count,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Remove rows timeout'));
          }
        }, 10000);
      });
    },
    [isReady, generateId]
  );

  // Add columns
  const addColumns = useCallback(
    async (sheetId: number, index: number, count: number): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'addColumns',
          id,
          sheetId,
          index,
          count,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Add columns timeout'));
          }
        }, 10000);
      });
    },
    [isReady, generateId]
  );

  // Remove columns
  const removeColumns = useCallback(
    async (sheetId: number, index: number, count: number): Promise<void> => {
      if (!workerRef.current || !isReady) {
        throw new Error('Worker not ready');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'removeColumns',
          id,
          sheetId,
          index,
          count,
        } as HyperFormulaWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Remove columns timeout'));
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
    setCellContents,
    setCellFormula,
    getCellValue,
    getCellFormula,
    getSheetValues,
    addSheet,
    removeSheet,
    setSheetContent,
    addRows,
    removeRows,
    addColumns,
    removeColumns,
  };
}
