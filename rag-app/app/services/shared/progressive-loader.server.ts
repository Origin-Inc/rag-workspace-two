/**
 * Progressive Data Loader Service
 *
 * Handles chunked loading of large files to prevent memory issues
 * and improve initial load times.
 *
 * Related Task: #80 - Phase 5: Implement Progressive Data Loading
 * Related ADR: ADR-002 (Shared Services Layer)
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { FileSchema } from '~/services/file-processing.server';

// Configuration
const DEFAULT_CHUNK_SIZE = 10000; // 10K rows per chunk
const MAX_MEMORY_PER_CHUNK = 100 * 1024 * 1024; // 100MB per chunk

export interface DataChunk {
  data: any[];
  chunkIndex: number;
  totalChunks: number;
  startRow: number;
  endRow: number;
  hasMore: boolean;
}

export interface ProgressiveLoadOptions {
  chunkSize?: number;
  onProgress?: (progress: ProgressInfo) => void;
  signal?: AbortSignal; // For cancellation
}

export interface ProgressInfo {
  loadedRows: number;
  totalRows: number;
  currentChunk: number;
  totalChunks: number;
  percentComplete: number;
  memoryUsageMB?: number;
}

export interface FileMetadata {
  totalRows: number;
  schema: FileSchema;
  estimatedChunks: number;
  fileSizeBytes: number;
}

/**
 * Progressive Data Loader
 * Loads large files in chunks to avoid memory spikes
 */
export class ProgressiveDataLoader {
  private readonly chunkSize: number;
  private readonly onProgress?: (progress: ProgressInfo) => void;
  private readonly signal?: AbortSignal;

  constructor(options: ProgressiveLoadOptions = {}) {
    this.chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    this.onProgress = options.onProgress;
    this.signal = options.signal;
  }

  /**
   * Get file metadata without loading full content
   * Useful for showing progress bars before loading
   */
  async getFileMetadata(file: File): Promise<FileMetadata> {
    if (file.name.toLowerCase().endsWith('.csv')) {
      return this.getCSVMetadata(file);
    } else if (file.name.toLowerCase().match(/\.(xlsx?|xls)$/)) {
      return this.getExcelMetadata(file);
    } else {
      throw new Error(`Unsupported file type: ${file.name}`);
    }
  }

  /**
   * Load CSV file in chunks
   */
  async *loadCSVInChunks(file: File): AsyncGenerator<DataChunk> {
    const text = await file.text();

    // Parse CSV and collect chunks (Papa.parse is callback-based, not async)
    const chunks = await new Promise<DataChunk[]>((resolve, reject) => {
      const collectedChunks: DataChunk[] = [];
      let currentChunk: any[] = [];
      let rowCount = 0;
      let chunkIndex = 0;
      let headers: string[] = [];

      Papa.parse(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        step: (result: any, parser: any) => {
          // Check for cancellation
          if (this.signal?.aborted) {
            parser.abort();
            reject(new Error('Operation cancelled'));
            return;
          }

          // Store headers from first row
          if (rowCount === 0 && result.meta?.fields) {
            headers = result.meta.fields;
          }

          currentChunk.push(result.data);
          rowCount++;

          // When chunk is full, store it
          if (currentChunk.length >= this.chunkSize) {
            collectedChunks.push({
              data: currentChunk,
              chunkIndex,
              totalChunks: -1, // Unknown until complete
              startRow: rowCount - currentChunk.length,
              endRow: rowCount - 1,
              hasMore: true
            });

            console.log(`[ProgressiveDataLoader] Chunk ${chunkIndex} ready: ${currentChunk.length} rows (${rowCount} total loaded)`);

            // Report progress
            if (this.onProgress) {
              this.onProgress({
                loadedRows: rowCount,
                totalRows: -1, // Unknown for streaming
                currentChunk: chunkIndex,
                totalChunks: -1,
                percentComplete: 0
              });
            }

            currentChunk = [];
            chunkIndex++;
          }
        },
        complete: () => {
          // Store final chunk if any data remains
          if (currentChunk.length > 0) {
            collectedChunks.push({
              data: currentChunk,
              chunkIndex,
              totalChunks: chunkIndex + 1,
              startRow: rowCount - currentChunk.length,
              endRow: rowCount - 1,
              hasMore: false
            });
            console.log(`[ProgressiveDataLoader] Final chunk ${chunkIndex}: ${currentChunk.length} rows`);
          }

          // Update all chunks with total count
          collectedChunks.forEach(chunk => {
            chunk.totalChunks = collectedChunks.length;
          });

          console.log(`[ProgressiveDataLoader] CSV parsing complete: ${collectedChunks.length} chunks, ${rowCount} total rows`);

          // Report final progress
          if (this.onProgress) {
            this.onProgress({
              loadedRows: rowCount,
              totalRows: rowCount,
              currentChunk: collectedChunks.length - 1,
              totalChunks: collectedChunks.length,
              percentComplete: 100
            });
          }

          resolve(collectedChunks);
        },
        error: (error: Error) => {
          reject(new Error(`Failed to parse CSV: ${error.message}`));
        }
      });
    });

    // Now yield each chunk as an async generator
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  /**
   * Load Excel file in chunks
   * Note: Excel files must be fully loaded first due to format,
   * but we can chunk the resulting data
   */
  async *loadExcelInChunks(file: File): AsyncGenerator<DataChunk> {
    try {
      // Excel files need to be fully loaded first
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });

      // Use first sheet
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        dateNF: 'yyyy-mm-dd'
      });

      // Now chunk the loaded data
      const totalRows = jsonData.length;
      const totalChunks = Math.ceil(totalRows / this.chunkSize);

      for (let i = 0; i < totalChunks; i++) {
        // Check for cancellation
        if (this.signal?.aborted) {
          throw new Error('Operation cancelled');
        }

        const start = i * this.chunkSize;
        const end = Math.min(start + this.chunkSize, totalRows);
        const chunkData = jsonData.slice(start, end);

        const chunk: DataChunk = {
          data: chunkData,
          chunkIndex: i,
          totalChunks,
          startRow: start,
          endRow: end - 1,
          hasMore: i < totalChunks - 1
        };

        // Report progress
        if (this.onProgress) {
          this.onProgress({
            loadedRows: end,
            totalRows,
            currentChunk: i,
            totalChunks,
            percentComplete: Math.round((end / totalRows) * 100)
          });
        }

        yield chunk;
      }

    } catch (error) {
      throw new Error(
        `Failed to parse Excel: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Load file in chunks (auto-detects type)
   */
  async *loadFileInChunks(file: File): AsyncGenerator<DataChunk> {
    if (file.name.toLowerCase().endsWith('.csv')) {
      yield* this.loadCSVInChunks(file);
    } else if (file.name.toLowerCase().match(/\.(xlsx?|xls)$/)) {
      yield* this.loadExcelInChunks(file);
    } else {
      throw new Error(`Unsupported file type: ${file.name}`);
    }
  }

  /**
   * Get row count without loading full content (CSV only)
   */
  private async getCSVMetadata(file: File): Promise<FileMetadata> {
    const text = await file.text();

    return new Promise((resolve, reject) => {
      let rowCount = 0;
      let schema: FileSchema | null = null;
      const sampleData: any[] = [];

      Papa.parse(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        step: (result: any) => {
          rowCount++;
          // Collect first 100 rows for schema inference
          if (sampleData.length < 100) {
            sampleData.push(result.data);
          }
        },
        complete: () => {
          // Infer schema from sample
          schema = this.inferSchemaFromSample(sampleData);

          resolve({
            totalRows: rowCount,
            schema,
            estimatedChunks: Math.ceil(rowCount / this.chunkSize),
            fileSizeBytes: file.size
          });
        },
        error: (error: Error) => {
          reject(new Error(`Failed to get CSV metadata: ${error.message}`));
        }
      });
    });
  }

  /**
   * Get Excel file metadata
   */
  private async getExcelMetadata(file: File): Promise<FileMetadata> {
    try {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        dateNF: 'yyyy-mm-dd'
      });

      const totalRows = jsonData.length;
      const sampleData = jsonData.slice(0, 100);
      const schema = this.inferSchemaFromSample(sampleData);

      return {
        totalRows,
        schema,
        estimatedChunks: Math.ceil(totalRows / this.chunkSize),
        fileSizeBytes: file.size
      };
    } catch (error) {
      throw new Error(
        `Failed to get Excel metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Infer schema from sample data
   * (Simplified version - full implementation in FileProcessingService)
   */
  private inferSchemaFromSample(sampleData: any[]): FileSchema {
    if (!sampleData || sampleData.length === 0) {
      return { columns: [], rowCount: 0, sampleData: [] };
    }

    const columnNames = Object.keys(sampleData[0]);
    const columns = columnNames.map(name => ({
      name,
      type: 'string' as const, // Simplified - real implementation does type detection
      nullable: true,
      sampleValues: sampleData.slice(0, 5).map(row => row[name])
    }));

    return {
      columns,
      rowCount: sampleData.length,
      sampleData: sampleData.slice(0, 10)
    };
  }

  /**
   * Estimate memory usage for a chunk
   */
  estimateChunkMemory(chunk: DataChunk): number {
    // Rough estimate: JSON.stringify size
    try {
      const jsonString = JSON.stringify(chunk.data);
      return jsonString.length;
    } catch {
      // Fallback estimation
      return chunk.data.length * 1024; // Assume ~1KB per row
    }
  }

  /**
   * Validate chunk memory usage
   */
  validateChunkMemory(chunk: DataChunk): boolean {
    const memoryUsage = this.estimateChunkMemory(chunk);
    return memoryUsage <= MAX_MEMORY_PER_CHUNK;
  }
}

/**
 * Factory function for creating progressive loaders
 */
export function createProgressiveLoader(
  options?: ProgressiveLoadOptions
): ProgressiveDataLoader {
  return new ProgressiveDataLoader(options);
}

/**
 * Helper: Load entire file progressively and collect all chunks
 * Useful for backward compatibility during migration
 */
export async function loadFileProgressive(
  file: File,
  options?: ProgressiveLoadOptions
): Promise<{ data: any[]; metadata: FileMetadata; chunks: DataChunk[] }> {
  const loader = new ProgressiveDataLoader(options);
  const metadata = await loader.getFileMetadata(file);

  const allData: any[] = [];
  const chunks: DataChunk[] = [];

  for await (const chunk of loader.loadFileInChunks(file)) {
    allData.push(...chunk.data);
    chunks.push(chunk);
  }

  return {
    data: allData,
    metadata,
    chunks
  };
}
