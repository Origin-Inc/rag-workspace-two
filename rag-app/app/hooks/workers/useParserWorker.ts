/**
 * React hook for Parser Worker
 *
 * Provides a convenient API for parsing CSV and Excel files in a Web Worker.
 * Supports progress tracking for large files and streaming parsing.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ParserWorkerMessage, ParserWorkerResponse } from '~/workers/parser.worker';
import type { ParseConfig } from 'papaparse';

export interface ParseProgress {
  progress: number;
  rowsParsed: number;
}

export interface ParseResult {
  data: any[];
  meta?: any;
  error?: string;
}

export interface ParserWorkerHook {
  parseCSV: (file: File | string, config?: ParseConfig, onProgress?: (progress: ParseProgress) => void) => Promise<ParseResult>;
  parseExcel: (file: File, sheetName?: string) => Promise<ParseResult>;
  getSheetNames: (file: File) => Promise<string[]>;
  cancel: (parseId: string) => void;
}

/**
 * Hook for using Parser Worker
 */
export function useParserWorker(): ParserWorkerHook {
  const workerRef = useRef<Worker | null>(null);

  // Store pending requests
  const pendingRequestsRef = useRef<
    Map<
      string,
      {
        resolve: (value: any) => void;
        reject: (error: any) => void;
        onProgress?: (progress: ParseProgress) => void;
      }
    >
  >(new Map());

  // Generate unique request ID
  const generateId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Initialize worker
  useEffect(() => {
    if (workerRef.current) return;

    try {
      // Create worker
      const worker = new Worker(new URL('~/workers/parser.worker.ts', import.meta.url), {
        type: 'module',
      });

      workerRef.current = worker;

      // Handle messages from worker
      worker.onmessage = (event: MessageEvent<ParserWorkerResponse>) => {
        const response = event.data;

        switch (response.type) {
          case 'parseComplete': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              if (response.error) {
                request.reject(new Error(response.error));
              } else {
                request.resolve({
                  data: response.data,
                  meta: response.meta,
                });
              }
              pendingRequestsRef.current.delete(response.id);
            }
            break;
          }

          case 'parseProgress': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request && request.onProgress) {
              request.onProgress({
                progress: response.progress,
                rowsParsed: response.rowsParsed,
              });
            }
            break;
          }

          case 'sheetNames': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              if (response.error) {
                request.reject(new Error(response.error));
              } else {
                request.resolve(response.names);
              }
              pendingRequestsRef.current.delete(response.id);
            }
            break;
          }

          case 'parseCancelled': {
            const request = pendingRequestsRef.current.get(response.id);
            if (request) {
              request.reject(new Error('Parse cancelled'));
              pendingRequestsRef.current.delete(response.id);
            }
            break;
          }
        }
      };

      worker.onerror = (error) => {
        console.error('Parser Worker error:', error);
      };
    } catch (err) {
      console.error('Failed to create Parser worker:', err);
    }

    // Cleanup on unmount
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      pendingRequestsRef.current.clear();
    };
  }, []);

  // Parse CSV file
  const parseCSV = useCallback(
    async (
      file: File | string,
      config?: ParseConfig,
      onProgress?: (progress: ParseProgress) => void
    ): Promise<ParseResult> => {
      if (!workerRef.current) {
        throw new Error('Worker not initialized');
      }

      const id = generateId();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject, onProgress });

        workerRef.current!.postMessage({
          type: 'parseCSV',
          id,
          file,
          config,
        } as ParserWorkerMessage);

        // Timeout after 5 minutes for very large files
        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Parse timeout'));
          }
        }, 300000);
      });
    },
    [generateId]
  );

  // Parse Excel file
  const parseExcel = useCallback(
    async (file: File, sheetName?: string): Promise<ParseResult> => {
      if (!workerRef.current) {
        throw new Error('Worker not initialized');
      }

      const id = generateId();

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'parseExcel',
          id,
          file: arrayBuffer,
          sheetName,
        } as ParserWorkerMessage);

        // Timeout after 2 minutes
        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Parse timeout'));
          }
        }, 120000);
      });
    },
    [generateId]
  );

  // Get sheet names from Excel file
  const getSheetNames = useCallback(
    async (file: File): Promise<string[]> => {
      if (!workerRef.current) {
        throw new Error('Worker not initialized');
      }

      const id = generateId();

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.set(id, { resolve, reject });

        workerRef.current!.postMessage({
          type: 'getSheetNames',
          id,
          file: arrayBuffer,
        } as ParserWorkerMessage);

        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id);
            reject(new Error('Get sheet names timeout'));
          }
        }, 30000);
      });
    },
    [generateId]
  );

  // Cancel an ongoing parse operation
  const cancel = useCallback((parseId: string) => {
    if (!workerRef.current) return;

    workerRef.current.postMessage({
      type: 'cancel',
      id: parseId,
    } as ParserWorkerMessage);

    // Clean up pending request
    if (pendingRequestsRef.current.has(parseId)) {
      const request = pendingRequestsRef.current.get(parseId);
      if (request) {
        request.reject(new Error('Parse cancelled'));
      }
      pendingRequestsRef.current.delete(parseId);
    }
  }, []);

  return {
    parseCSV,
    parseExcel,
    getSheetNames,
    cancel,
  };
}
