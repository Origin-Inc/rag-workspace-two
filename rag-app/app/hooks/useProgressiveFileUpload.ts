/**
 * Progressive File Upload Hook
 * Task #80.4: Update useProgressiveDataLoad hook for chunk-based loading
 *
 * ALL files are uploaded directly to Supabase Storage (bypasses Vercel 4.5MB limit)
 * File size determines PROCESSING strategy:
 * - < 2MB: Parse entire file at once (fast)
 * - > 2MB: Parse in chunks (memory-efficient, progressive loading)
 *
 * Upload path: Browser → Supabase Storage → Vercel (download) → Process → Stream
 * This supports files up to 5GB (Supabase free tier limit)
 */

import { useState, useCallback, useRef } from 'react';
import { getDuckDB } from '~/services/duckdb/duckdb-service.client';
import { SupabaseUploadClient } from '~/services/supabase-upload.client';
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
   * Upload file directly to Supabase Storage, then process based on size
   * ALL files use this method (no size-based branching for upload)
   *
   * Flow:
   * 1. Upload file directly to Supabase Storage (0-40% progress)
   * 2. Send metadata to Vercel (storageUrl, filename, size)
   * 3. Vercel downloads file from Supabase (server-to-server, no limit)
   * 4. Vercel determines processing strategy:
   *    - < 2MB: Parse entire file at once (40-100% progress)
   *    - > 2MB: Parse in chunks and stream (40-100% progress via SSE)
   * 5. Client loads data/chunks into DuckDB
   */
  const uploadFile = useCallback(
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

        console.log('[Direct Upload] Starting direct Supabase upload:', file.name, file.size);

        // Step 1: Initialize Supabase client
        const supabaseClient = SupabaseUploadClient.getInstance();
        const initialized = await supabaseClient.initialize();

        if (!initialized) {
          throw new Error('Failed to initialize Supabase client');
        }

        // Step 2: Upload file directly to Supabase Storage
        const timestamp = Date.now();
        const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `${workspaceId}/${pageId}/${timestamp}_${sanitizedFilename}`;

        console.log('[Direct Upload] Uploading to Supabase:', storagePath);

        const uploadResult = await supabaseClient.uploadFile(file, storagePath, {
          bucket: 'user-uploads',
          onProgress: (percent) => {
            console.log(`[Direct Upload] Upload progress: ${percent}%`);
            setState(prev => ({
              ...prev,
              progress: Math.round(percent * 0.4) // Upload is 40% of total progress (0-40%)
            }));
          },
          upsert: true
        });

        if (uploadResult.error || !uploadResult.url) {
          throw new Error(uploadResult.error || 'Upload failed - no URL returned');
        }

        console.log('[Direct Upload] Upload complete:', uploadResult.url);

        // Step 3: Send metadata to Vercel for processing
        setState(prev => ({ ...prev, status: 'processing', progress: 40 }));

        console.log('[Direct Upload] Sending metadata to Vercel for processing');

        const metadataResponse = await fetch(
          `/api/data/upload-progressive?pageId=${pageId}&workspaceId=${workspaceId}&mode=metadata`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storageUrl: uploadResult.url,
              storagePath: uploadResult.path,
              filename: file.name,
              fileSize: file.size,
              mimeType: file.type
            })
          }
        );

        if (!metadataResponse.ok) {
          const error = await metadataResponse.json();
          throw new Error(error.error || 'Metadata processing failed');
        }

        const metadata = await metadataResponse.json();

        if (!metadata.success || !metadata.dataFile) {
          throw new Error('Failed to get file metadata');
        }

        console.log('[Direct Upload] Metadata received:', metadata.dataFile);

        setState(prev => ({
          ...prev,
          dataFileId: metadata.dataFile.id,
          tableName: metadata.dataFile.tableName,
          totalRows: metadata.dataFile.rowCount,
          totalChunks: metadata.dataFile.estimatedChunks,
          progress: 50
        }));

        // Step 4: Create empty DuckDB table
        const duckdb = getDuckDB();
        await duckdb.initialize();

        const schema = metadata.dataFile.schema as FileSchema;
        const tableName = metadata.dataFile.tableName;

        console.log('[Direct Upload] Creating DuckDB table:', tableName);

        // Step 5: Stream chunks from Vercel and insert into DuckDB
        return new Promise<void>((resolve, reject) => {
          const streamUrl = `/api/data/upload-progressive?pageId=${pageId}&workspaceId=${workspaceId}&mode=stream`;

          fetch(streamUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storageUrl: uploadResult.url,
              storagePath: uploadResult.path,
              filename: file.name,
              fileSize: file.size,
              mimeType: file.type
            })
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
                      console.log('[Direct Upload] Stream complete');
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

                      console.log(`[Direct Upload] Event: ${eventType}`, data);

                      switch (eventType) {
                        case 'metadata':
                          // Metadata already handled
                          break;

                        case 'chunk':
                          // Create table on first chunk
                          if (!tableCreated) {
                            console.log('[Direct Upload] Creating table with first chunk');
                            await duckdb.createTableFromData(tableName, data.data, schema, pageId);
                            tableCreated = true;
                          } else {
                            // Insert subsequent chunks
                            await duckdb.insertChunk(tableName, data.data, schema);
                          }

                          // Update progress (50% to 100%)
                          const progressPercent = 50 + Math.round((data.totalRowsStreamed / metadata.dataFile.rowCount) * 50);

                          setState(prev => ({
                            ...prev,
                            loadedRows: data.totalRowsStreamed,
                            loadedChunks: data.chunkIndex + 1,
                            progress: progressPercent
                          }));

                          if (onChunkProcessed) {
                            onChunkProcessed(data.data, data.chunkIndex);
                          }

                          console.log(
                            `[Direct Upload] Processed chunk ${data.chunkIndex}: ${data.rowCount} rows (${data.totalRowsStreamed}/${metadata.dataFile.rowCount})`
                          );
                          break;

                        case 'complete':
                          console.log('[Direct Upload] Upload complete:', data);
                          break;

                        case 'error':
                          throw new Error(data.error);
                      }
                    }
                  }
                } catch (error) {
                  console.error('[Direct Upload] Stream processing error:', error);
                  const err = error instanceof Error ? error : new Error('Stream processing failed');
                  setState(prev => ({ ...prev, status: 'error', error: err }));
                  if (onError) onError(err);
                  reject(err);
                }
              };

              processStream();
            })
            .catch(error => {
              console.error('[Direct Upload] Stream fetch error:', error);
              const err = error instanceof Error ? error : new Error('Stream fetch failed');
              setState(prev => ({ ...prev, status: 'error', error: err }));
              if (onError) onError(err);
              reject(err);
            });
        });
      } catch (error) {
        console.error('[Direct Upload] Error:', error);
        const err = error instanceof Error ? error : new Error('Upload failed');
        setState(prev => ({ ...prev, status: 'error', error: err }));
        if (onError) onError(err);
        throw err;
      }
    },
    [pageId, workspaceId, onChunkProcessed, onComplete, onError]
  );

  /**
   * Upload file with smart detection (DEPRECATED - now all files use direct upload)
   * Kept for backward compatibility, just calls uploadFile()
   */
  const uploadSmart = useCallback(
    async (file: File) => {
      console.log(`[Upload] Using direct Supabase upload for ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
      return uploadFile(file);
    },
    [uploadFile]
  );

  /**
   * LEGACY METHOD - DO NOT USE
   * Kept for backward compatibility only
   * Use uploadFile() or uploadSmart() instead
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
   * LEGACY METHOD - DO NOT USE
   * Standard upload through Vercel (hits 4.5MB limit)
   * Use uploadFile() instead
   */
  const uploadStandard = useCallback(
    async (file: File) => {
      console.warn('[Upload] uploadStandard is deprecated - using uploadFile() instead');
      return uploadFile(file);
    },
    [uploadFile]
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
    uploadFile,        // PRIMARY: Use this for all uploads
    uploadSmart,       // ALIAS: Calls uploadFile()
    uploadProgressive, // DEPRECATED: Legacy method
    uploadStandard,    // DEPRECATED: Legacy method
    uploadDirect: uploadFile, // DEPRECATED ALIAS: Use uploadFile() instead
    cancel,
    reset,

    // Computed
    isUploading: state.status === 'uploading' || state.status === 'processing',
    isComplete: state.status === 'complete',
    hasError: state.status === 'error'
  };
}
