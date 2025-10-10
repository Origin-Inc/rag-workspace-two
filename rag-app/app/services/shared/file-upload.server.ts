/**
 * Shared File Upload Service
 *
 * Centralizes all file upload logic to eliminate duplication across:
 * - ChatInput.tsx
 * - ChatSidebarPerformant.tsx
 * - FileUploadZone.tsx
 * - FileUploadDropzone.tsx
 *
 * Related ADR: ADR-002 (Shared Services Layer)
 * Related Task: #65
 */

import { FileProcessingService, type FileSchema } from '~/services/file-processing.server';
import { FileStorageService } from '~/services/storage/file-storage.server';
import { DuckDBSerializationService } from '~/services/duckdb/duckdb-serialization.server';
import { prisma } from '~/utils/db.server';

// Constants
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = ['.csv', '.xlsx', '.xls'] as const;
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
] as const;

// Types
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface UploadResult {
  success: boolean;
  dataFile?: {
    id: string;
    filename: string;
    tableName: string;
    schema: FileSchema;
    rowCount: number;
    sizeBytes: number;
    storageUrl: string | null;
    parquetUrl: string | null;
    data: any[]; // For client-side DuckDB
  };
  error?: string;
}

export interface UploadOptions {
  pageId: string;
  workspaceId: string;
  userId: string;
  request?: Request; // For Supabase storage
  response?: Response; // For Supabase storage
}

/**
 * Centralized file upload service
 * Single source of truth for all file upload operations
 */
export class FileUploadService {
  /**
   * Validate file before upload
   * Checks file size and type
   */
  static validateFile(file: File): ValidationResult {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File "${file.name}" is too large. Maximum size is 50MB.`
      };
    }

    // Check file size is not zero
    if (file.size === 0) {
      return {
        valid: false,
        error: `File "${file.name}" is empty.`
      };
    }

    // Check file extension
    const fileExtension = file.name.toLowerCase();
    const hasValidExtension = ALLOWED_TYPES.some(ext => fileExtension.endsWith(ext));

    if (!hasValidExtension) {
      return {
        valid: false,
        error: `File "${file.name}" is not supported. Please upload CSV or Excel files only.`
      };
    }

    // Check MIME type if available
    if (file.type) {
      const hasValidMimeType = ALLOWED_MIME_TYPES.includes(file.type as any);
      if (!hasValidMimeType) {
        return {
          valid: false,
          error: `File "${file.name}" has invalid MIME type. Please upload CSV or Excel files only.`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Upload and process a file
   *
   * Steps:
   * 1. Validate file
   * 2. Upload original to Supabase Storage
   * 3. Parse CSV/Excel
   * 4. Create Parquet for DuckDB
   * 5. Save metadata to PostgreSQL
   * 6. Return processed data for client
   */
  static async upload(
    file: File,
    options: UploadOptions
  ): Promise<UploadResult> {
    const { pageId, workspaceId, userId, request, response } = options;

    try {
      // 1. Validate file
      const validation = this.validateFile(file);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // 2. Verify user has access to workspace
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: workspaceId,
          userWorkspaces: {
            some: {
              userId: userId
            }
          }
        }
      });

      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found or access denied'
        };
      }

      // 3. Parse the file (CSV or Excel)
      console.log(`[FileUploadService] Parsing file: ${file.name}`);
      const processedData = await FileProcessingService.processFile(file);
      console.log(`[FileUploadService] Parsed ${processedData.data?.length || 0} rows, table: ${processedData.tableName}`);

      let storageUrl: string | null = null;
      let parquetUrl: string | null = null;

      // 4. Upload to Supabase Storage (if request/response provided)
      if (request && response) {
        const storageService = new FileStorageService(request, response);

        // Upload original file
        const originalPath = `${workspaceId}/${pageId}/${Date.now()}_${file.name}`;
        await storageService.uploadFile(
          'user-uploads',
          originalPath,
          file,
          file.type
        );
        storageUrl = await storageService.getSignedUrl('user-uploads', originalPath, 86400); // 24 hours

        // Save data as JSON for persistence
        if (processedData.data && processedData.data.length > 0) {
          const jsonData = {
            tableName: processedData.tableName,
            data: processedData.data,
            schema: processedData.schema,
            type: file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'excel',
            timestamp: new Date().toISOString()
          };

          const jsonPath = `${workspaceId}/${pageId}/${processedData.tableName}_data.json`;
          const jsonBuffer = Buffer.from(JSON.stringify(jsonData));

          await storageService.uploadFile(
            'duckdb-tables',
            jsonPath,
            jsonBuffer,
            'application/json'
          );

          parquetUrl = await storageService.getSignedUrl('duckdb-tables', jsonPath, 86400);

          // Create Parquet file for DuckDB compatibility
          try {
            const serializationService = new DuckDBSerializationService();
            const parquetBuffer = await serializationService.serializeToParquet(
              processedData.data,
              processedData.schema,
              processedData.tableName
            );
            await serializationService.close();

            const parquetPath = `${workspaceId}/${pageId}/${processedData.tableName}.parquet`;
            await storageService.uploadFile(
              'duckdb-tables',
              parquetPath,
              parquetBuffer,
              'application/octet-stream'
            );
            console.log(`[FileUploadService] Parquet file created: ${parquetPath}`);
          } catch (parquetError) {
            console.warn(`[FileUploadService] Could not create Parquet:`, parquetError);
          }
        }
      }

      // 5. Save metadata to database
      const dataFile = await prisma.dataFile.create({
        data: {
          pageId,
          workspaceId,
          filename: file.name,
          tableName: processedData.tableName,
          schema: processedData.schema,
          rowCount: processedData.schema.rowCount,
          sizeBytes: file.size,
          storageUrl,
          parquetUrl
        }
      });

      console.log(`[FileUploadService] File uploaded successfully: ${dataFile.id}`);

      // 6. Return result with data for client-side DuckDB
      return {
        success: true,
        dataFile: {
          id: dataFile.id,
          filename: file.name,
          tableName: processedData.tableName,
          schema: processedData.schema,
          rowCount: processedData.schema.rowCount,
          sizeBytes: file.size,
          storageUrl,
          parquetUrl,
          data: processedData.data // Client needs this for DuckDB
        }
      };

    } catch (error) {
      console.error(`[FileUploadService] Upload failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload file'
      };
    }
  }

  /**
   * Validate multiple files at once
   * Returns array of validation results
   */
  static validateFiles(files: File[]): Array<{ file: File; validation: ValidationResult }> {
    return files.map(file => ({
      file,
      validation: this.validateFile(file)
    }));
  }

  /**
   * Upload multiple files
   * Processes files sequentially to avoid overwhelming the system
   */
  static async uploadMultiple(
    files: File[],
    options: UploadOptions
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const file of files) {
      const result = await this.upload(file, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Get allowed file types as string for input accept attribute
   */
  static getAllowedTypes(): string {
    return ALLOWED_TYPES.join(',');
  }

  /**
   * Check if filename has allowed extension
   */
  static hasAllowedExtension(filename: string): boolean {
    const lowerFilename = filename.toLowerCase();
    return ALLOWED_TYPES.some(ext => lowerFilename.endsWith(ext));
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Get max file size in bytes
   */
  static getMaxFileSize(): number {
    return MAX_FILE_SIZE;
  }

  /**
   * Get max file size formatted for display
   */
  static getMaxFileSizeFormatted(): string {
    return this.formatFileSize(MAX_FILE_SIZE);
  }

  /**
   * PROGRESSIVE LOADING SUPPORT
   * Task #80: Implement Progressive Data Loading
   *
   * These methods enable chunked file uploads to prevent memory issues
   * with large datasets
   */

  /**
   * Upload and process a file progressively
   * Returns metadata immediately, data is streamed
   *
   * Steps:
   * 1. Validate file
   * 2. Get metadata without full load
   * 3. Upload original to Supabase Storage
   * 4. Return metadata + stream generator
   *
   * @param file - File to upload
   * @param options - Upload options
   * @returns Promise with metadata and data stream
   */
  static async uploadProgressive(
    file: File,
    options: UploadOptions
  ): Promise<{
    success: boolean;
    dataFile?: {
      id: string;
      filename: string;
      tableName: string;
      schema: FileSchema;
      rowCount: number;
      sizeBytes: number;
      storageUrl: string | null;
      parquetUrl: string | null;
      // Data stream instead of full array
      dataStream: AsyncGenerator<any[]>;
      estimatedChunks: number;
    };
    error?: string;
  }> {
    const { pageId, workspaceId, userId, request, response } = options;

    try {
      // 1. Validate file
      const validation = this.validateFile(file);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // 2. Verify user has access to workspace
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: workspaceId,
          userWorkspaces: {
            some: {
              userId: userId
            }
          }
        }
      });

      if (!workspace) {
        return {
          success: false,
          error: 'Workspace not found or access denied'
        };
      }

      // 3. Get file metadata without loading full content
      console.log(`[FileUploadService] Getting metadata for: ${file.name}`);
      const metadata = await FileProcessingService.getFileMetadata(file);
      console.log(`[FileUploadService] File has ${metadata.totalRows} rows, ${metadata.estimatedChunks} chunks`);

      let storageUrl: string | null = null;
      let parquetUrl: string | null = null;

      // 4. Upload to Supabase Storage (if request/response provided)
      if (request && response) {
        const storageService = new FileStorageService(request, response);

        // Upload original file
        const originalPath = `${workspaceId}/${pageId}/${Date.now()}_${file.name}`;
        await storageService.uploadFile(
          'user-uploads',
          originalPath,
          file,
          file.type
        );
        storageUrl = await storageService.getSignedUrl('user-uploads', originalPath, 86400); // 24 hours
        console.log(`[FileUploadService] Original file uploaded: ${originalPath}`);

        // Note: We'll save processed data progressively, not here
        // This avoids loading full dataset into memory
      }

      // 5. Save metadata to database
      const dataFile = await prisma.dataFile.create({
        data: {
          pageId,
          workspaceId,
          filename: file.name,
          tableName: metadata.tableName,
          schema: metadata.schema,
          rowCount: metadata.totalRows,
          sizeBytes: file.size,
          storageUrl,
          parquetUrl // Will be null initially, can be updated after processing
        }
      });

      console.log(`[FileUploadService] File uploaded progressively: ${dataFile.id}`);

      // 6. Create data stream generator
      const dataStream = FileProcessingService.processFileProgressive(file);

      // Return metadata + stream
      return {
        success: true,
        dataFile: {
          id: dataFile.id,
          filename: file.name,
          tableName: metadata.tableName,
          schema: metadata.schema,
          rowCount: metadata.totalRows,
          sizeBytes: file.size,
          storageUrl,
          parquetUrl,
          dataStream: (async function* () {
            for await (const chunk of dataStream) {
              yield chunk.chunk;
            }
          })(),
          estimatedChunks: metadata.estimatedChunks
        }
      };

    } catch (error) {
      console.error(`[FileUploadService] Progressive upload failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload file'
      };
    }
  }

  /**
   * Check if file should use progressive loading
   * Based on file size and row count estimates
   */
  static async shouldUseProgressiveLoading(file: File): Promise<boolean> {
    try {
      return await FileProcessingService.shouldUseProgressiveLoading(file);
    } catch {
      // Default to progressive for large files
      const SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB
      return file.size > SIZE_THRESHOLD;
    }
  }

  /**
   * Smart upload: automatically chooses progressive or standard upload
   * based on file size and characteristics
   */
  static async uploadSmart(
    file: File,
    options: UploadOptions
  ): Promise<UploadResult | Awaited<ReturnType<typeof FileUploadService.uploadProgressive>>> {
    const useProgressive = await this.shouldUseProgressiveLoading(file);

    if (useProgressive) {
      console.log(`[FileUploadService] Using progressive upload for ${file.name}`);
      return this.uploadProgressive(file, options);
    } else {
      console.log(`[FileUploadService] Using standard upload for ${file.name}`);
      return this.upload(file, options);
    }
  }
}
