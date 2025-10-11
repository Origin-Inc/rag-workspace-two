/**
 * Progressive File Upload Hook
 * Task #80.4: Update useProgressiveDataLoad hook for chunk-based loading
 *
 * Handles large file uploads with progressive loading to prevent memory issues.
 * Streams data chunks and feeds them to DuckDB incrementally.
 */

import { useState, useCallback, useRef } from 'react';
import { getDuckDB } from '~/services/duckdb/duckdb-service.client';
import type { FileSchema } from '~/services/file-processing.server';

export interface ProgressiveUploadState {
  status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error';
  progress: number; // 0-100
  loadedRows: number;
  totalRows: number;
  loadedChunks: number;
  totalChunks: number;
  error: Error | null;
  dataFileId?: string;
  tableName?: string;
}

export interface ProgressiveUploadOptions {
  pageId: string;
  workspaceId: string;
  onChunkProcessed?: (chunk: any[], chunkIndex: number) => void;
  onComplete?: (result: { dataFileId: string; tableName: string; rowCount: number }) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for progressive file uploads
 * Handles streaming file data and feeding it to DuckDB
 */
export function useProgressiveFileUpload(options: ProgressiveUploadOptions) {
  const { pageId, workspaceId, onChunkProcessed, onComplete, onError } = options;

  const [state, setState] = useState<ProgressiveUploadState>({
    status: 'idle',
    progress: 0,
    loadedRows: 0,
    totalRows: 0,
    loadedChunks: 0,
    totalChunks: 0,
    error: null
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  /**
   * Upload file progressively using metadata-first approach
   * 1. Upload file and get metadata
   * 2. Create DuckDB table with schema
   * 3. Stream chunks and insert progressively
   */
  const uploadProgressive = useCallback(
    async (file: File) => {
      try {
        // Reset state
        setState({
          status: 'uploading',
          progress: 0,
          loadedRows: 0,
          totalRows: 0,
          loadedChunks: 0,
          totalChunks: 0,
          error: null
        });

        // Create abort controller for cancellation
        abortControllerRef.current = new AbortController();

        // Step 1: Upload file and get metadata (fast, no full processing)
        const formData = new FormData();
        formData.append('file', file);

        console.log('[Progressive Upload] Uploading file for metadata...');
        const metadataResponse = await fetch(
          `/api/data/upload-progressive?pageId=${pageId}&workspaceId=${workspaceId}&mode=metadata`,
          {
            method: 'POST',
            body: formData,
            signal: abortControllerRef.current.signal
          }
        );

        if (!metadataResponse.ok) {
          const error = await metadataResponse.json();
          throw new Error(error.error || 'Upload failed');
        }

        const metadata = await metadataResponse.json();

        if (!metadata.success || !metadata.dataFile) {
          throw new Error('Failed to get file metadata');
        }

        console.log('[Progressive Upload] Metadata received:', metadata.dataFile);

        setState(prev => ({
          ...prev,
          dataFileId: metadata.dataFile.id,
          tableName: metadata.dataFile.tableName,
          totalRows: metadata.dataFile.rowCount,
          totalChunks: metadata.dataFile.estimatedChunks
        }));

        // Step 2: Create empty DuckDB table with schema
        setState(prev => ({ ...prev, status: 'processing' }));

        const duckdb = getDuckDB();
        await duckdb.initialize();

        console.log('[Progressive Upload] Creating DuckDB table:', metadata.dataFile.tableName);

        // Create table structure (no data yet)
        const schema = metadata.dataFile.schema as FileSchema;
        const tableName = metadata.dataFile.tableName;

        // We'll create the table when we get the first chunk
        // For now, just prepare

        // Step 3: Stream chunks and insert into DuckDB
        return new Promise<void>((resolve, reject) => {
          const streamUrl = `/api/data/upload-progressive?pageId=${pageId}&workspaceId=${workspaceId}&mode=stream`;

          // Upload file again for streaming (could be optimized with session storage)
          const streamFormData = new FormData();
          streamFormData.append('file', file);

          fetch(streamUrl, {
            method: 'POST',
            body: streamFormData,
            signal: abortControllerRef.current?.signal
          })
            .then(response => {
              if (!response.body) {
                throw new Error('No response body');
              }

              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              let tableCreated = false;

              const processStream = async () => {
                try {
                  while (true) {
                    const { done, value } = await reader.read();

                    if (done) {
                      console.log('[Progressive Upload] Stream complete');
                      setState(prev => ({ ...prev, status: 'complete', progress: 100 }));

                      if (onComplete) {
                        onComplete({
                          dataFileId: metadata.dataFile.id,
                          tableName: metadata.dataFile.tableName,
                          rowCount: metadata.dataFile.rowCount
                        });
                      }

                      resolve();
                      break;
                    }

                    // Decode chunk
                    buffer += decoder.decode(value, { stream: true });

                    // Process SSE events
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                      if (!line.trim()) continue;

                      // Parse SSE format: "event: type\ndata: json"
                      const eventMatch = line.match(/event: (\w+)\ndata: (.+)/s);
                      if (!eventMatch) continue;

                      const [, eventType, eventData] = eventMatch;
                      const data = JSON.parse(eventData);

                      console.log(`[Progressive Upload] Event: ${eventType}`, data);

                      switch (eventType) {
                        case 'metadata':
                          // Metadata already handled
                          break;

                        case 'chunk':
                          // Create table on first chunk
                          if (!tableCreated) {
                            console.log('[Progressive Upload] Creating table with first chunk');
                            await duckdb.createTableFromData(tableName, data.data, schema, pageId);
                            tableCreated = true;
                          } else {
                            // Insert subsequent chunks
                            await duckdb.insertChunk(tableName, data.data, schema);
                          }

                          // Update progress
                          setState(prev => ({
                            ...prev,
                            loadedRows: data.totalRowsStreamed,
                            loadedChunks: data.chunkIndex + 1,
                            progress: Math.round((data.totalRowsStreamed / prev.totalRows) * 100)
                          }));

                          if (onChunkProcessed) {
                            onChunkProcessed(data.data, data.chunkIndex);
                          }

                          console.log(
                            `[Progressive Upload] Processed chunk ${data.chunkIndex}: ${data.rowCount} rows (${data.totalRowsStreamed}/${metadata.dataFile.rowCount})`
                          );
                          break;

                        case 'complete':
                          console.log('[Progressive Upload] Upload complete:', data);
                          break;

                        case 'error':
                          throw new Error(data.error);
                      }
                    }
                  }
                } catch (error) {
                  console.error('[Progressive Upload] Stream processing error:', error);
                  const err = error instanceof Error ? error : new Error('Stream processing failed');
                  setState(prev => ({ ...prev, status: 'error', error: err }));
                  if (onError) onError(err);
                  reject(err);
                }
              };

              processStream();
            })
            .catch(error => {
              console.error('[Progressive Upload] Stream fetch error:', error);
              const err = error instanceof Error ? error : new Error('Stream fetch failed');
              setState(prev => ({ ...prev, status: 'error', error: err }));
              if (onError) onError(err);
              reject(err);
            });
        });
      } catch (error) {
        console.error('[Progressive Upload] Error:', error);
        const err = error instanceof Error ? error : new Error('Upload failed');
        setState(prev => ({ ...prev, status: 'error', error: err }));
        if (onError) onError(err);
        throw err;
      }
    },
    [pageId, workspaceId, onChunkProcessed, onComplete, onError]
  );

  /**
   * Standard upload for small files (non-progressive)
   */
  const uploadStandard = useCallback(
    async (file: File) => {
      try {
        setState(prev => ({ ...prev, status: 'uploading', progress: 50 }));

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(
          `/api/data/upload/v2?pageId=${pageId}&workspaceId=${workspaceId}`,
          {
            method: 'POST',
            body: formData
          }
        );

        if (!response.ok) {
          throw new Error('Upload failed');
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        // Load data into DuckDB
        setState(prev => ({ ...prev, status: 'processing', progress: 75 }));

        const processedFile = result.files[0];
        if (processedFile && processedFile.data) {
          const duckdb = getDuckDB();
          await duckdb.initialize();
          await duckdb.createTableFromData(
            processedFile.tableName,
            processedFile.data,
            processedFile.schema,
            pageId
          );
        }

        setState(prev => ({
          ...prev,
          status: 'complete',
          progress: 100,
          loadedRows: processedFile.rowCount,
          totalRows: processedFile.rowCount,
          dataFileId: processedFile.id,
          tableName: processedFile.tableName
        }));

        if (onComplete) {
          onComplete({
            dataFileId: processedFile.id,
            tableName: processedFile.tableName,
            rowCount: processedFile.rowCount
          });
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Upload failed');
        setState(prev => ({ ...prev, status: 'error', error: err }));
        if (onError) onError(err);
        throw err;
      }
    },
    [pageId, workspaceId, onComplete, onError]
  );

  /**
   * Upload file with smart detection
   * Automatically uses progressive for large files
   */
  const uploadSmart = useCallback(
    async (file: File) => {
      // Use 3MB threshold to prevent HTTP 413 errors from standard endpoint
      // This is a safe buffer below the body size limit (avoids FormData encoding overhead)
      const SIZE_THRESHOLD = 3 * 1024 * 1024; // 3MB

      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

      if (file.size > SIZE_THRESHOLD) {
        console.log(`[Upload] Using progressive upload (file size ${sizeMB}MB > 3MB)`);
        return uploadProgressive(file);
      }

      console.log(`[Upload] Using standard upload (file size ${sizeMB}MB <= 3MB)`);
      return uploadStandard(file);
    },
    [uploadProgressive, uploadStandard]
  );

  /**
   * Cancel ongoing upload
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setState(prev => ({
      ...prev,
      status: 'idle',
      error: new Error('Upload cancelled by user')
    }));
  }, []);

  /**
   * Reset upload state
   */
  const reset = useCallback(() => {
    cancel();
    setState({
      status: 'idle',
      progress: 0,
      loadedRows: 0,
      totalRows: 0,
      loadedChunks: 0,
      totalChunks: 0,
      error: null
    });
  }, [cancel]);

  return {
    // State
    ...state,

    // Methods
    uploadProgressive,
    uploadSmart,
    uploadStandard,
    cancel,
    reset,

    // Computed
    isUploading: state.status === 'uploading' || state.status === 'processing',
    isComplete: state.status === 'complete',
    hasError: state.status === 'error'
  };
}
