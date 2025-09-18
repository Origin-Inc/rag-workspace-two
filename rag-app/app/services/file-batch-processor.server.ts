import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Readable } from 'stream';
import { prisma } from '~/utils/db.server';
import { FileUploadService } from './file-upload.server';
import type { FileSchema } from './file-processing.client';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export interface BatchProcessingResult {
  tableName: string;
  schema: FileSchema;
  rowCount: number;
  processedRows: number;
  sampleData: any[];
  statistics?: {
    nullCounts: Record<string, number>;
    uniqueCounts: Record<string, number>;
    minValues?: Record<string, number>;
    maxValues?: Record<string, number>;
  };
}

export class FileBatchProcessor {
  private static readonly BATCH_SIZE = 1000;
  private static readonly SAMPLE_SIZE = 10;

  /**
   * Process a file from storage in batches
   */
  static async processFileFromStorage(
    fileId: string,
    jobId: string,
    options: {
      onProgress?: (progress: number, processedRows: number, totalRows: number) => Promise<void>;
      onBatch?: (batchData: any[], batchNumber: number) => Promise<void>;
    } = {}
  ): Promise<BatchProcessingResult> {
    const { onProgress, onBatch } = options;

    // Get file record
    const file = await prisma.userFile.findUnique({
      where: { id: fileId },
      include: { workspace: true }
    });

    if (!file) {
      throw new Error('File not found');
    }

    // Update job status to running
    await prisma.fileProcessingJob.update({
      where: { id: jobId },
      data: {
        status: 'running',
        startedAt: new Date()
      }
    });

    try {
      // Download file from storage
      const { data: fileData, error } = await supabase.storage
        .from(FileUploadService.BUCKET_NAME)
        .download(file.storagePath);

      if (error || !fileData) {
        throw new Error(`Failed to download file: ${error?.message}`);
      }

      // Convert blob to buffer
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Process based on file type
      let result: BatchProcessingResult;

      if (file.mimeType === 'text/csv' || file.originalName.endsWith('.csv')) {
        result = await this.processCSVInBatches(
          buffer,
          file.originalName,
          jobId,
          onProgress,
          onBatch
        );
      } else if (
        file.mimeType === 'application/vnd.ms-excel' ||
        file.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.originalName.endsWith('.xlsx') ||
        file.originalName.endsWith('.xls')
      ) {
        result = await this.processExcelInBatches(
          buffer,
          file.originalName,
          jobId,
          onProgress,
          onBatch
        );
      } else if (file.mimeType === 'application/pdf') {
        // PDF processing would go here
        throw new Error('PDF processing not yet implemented');
      } else {
        throw new Error(`Unsupported file type: ${file.mimeType}`);
      }

      // Create or update data table record
      const dataTable = await prisma.userDataTable.upsert({
        where: {
          workspaceId_tableName: {
            workspaceId: file.workspaceId,
            tableName: result.tableName
          }
        },
        create: {
          workspaceId: file.workspaceId,
          tableName: result.tableName,
          displayName: file.originalName,
          schema: result.schema,
          rowCount: result.rowCount,
          sampleData: result.sampleData,
          storageType: 'postgres',
          metadata: {
            fileId,
            originalFilename: file.originalName,
            processedAt: new Date().toISOString()
          },
          statistics: result.statistics || {}
        },
        update: {
          rowCount: result.rowCount,
          sampleData: result.sampleData,
          statistics: result.statistics || {},
          updatedAt: new Date()
        }
      });

      // Update file record
      await prisma.userFile.update({
        where: { id: fileId },
        data: {
          dataTableId: dataTable.id,
          processingStatus: 'completed',
          processedAt: new Date()
        }
      });

      // Update job status
      await prisma.fileProcessingJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          progressPercent: 100,
          processedRows: result.processedRows,
          totalRows: result.rowCount
        }
      });

      return result;
    } catch (error) {
      // Update job status on error
      await prisma.fileProcessingJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorDetails: error instanceof Error ? { stack: error.stack } : {},
          completedAt: new Date()
        }
      });

      // Update file status
      await prisma.userFile.update({
        where: { id: fileId },
        data: {
          processingStatus: 'failed',
          processingError: error instanceof Error ? error.message : 'Unknown error'
        }
      });

      throw error;
    }
  }

  /**
   * Process CSV in batches
   */
  private static async processCSVInBatches(
    buffer: Buffer,
    filename: string,
    jobId: string,
    onProgress?: (progress: number, processedRows: number, totalRows: number) => Promise<void>,
    onBatch?: (batchData: any[], batchNumber: number) => Promise<void>
  ): Promise<BatchProcessingResult> {
    return new Promise((resolve, reject) => {
      const content = buffer.toString('utf-8');
      const tableName = this.generateTableName(filename);
      let schema: FileSchema | null = null;
      let processedRows = 0;
      let totalRows = 0;
      let currentBatch: any[] = [];
      let batchNumber = 0;
      const sampleData: any[] = [];
      const statistics = {
        nullCounts: {} as Record<string, number>,
        uniqueCounts: {} as Record<string, number>,
        minValues: {} as Record<string, number>,
        maxValues: {} as Record<string, number>
      };

      // First pass: count total rows
      const lines = content.split('\n');
      totalRows = lines.filter(line => line.trim()).length - 1; // Subtract header

      Papa.parse(content, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        chunk: async (chunk: any) => {
          const data = chunk.data as any[];
          
          // Infer schema from first chunk
          if (!schema && data.length > 0) {
            schema = this.inferSchema(data);
            // Initialize statistics
            schema.columns.forEach(col => {
              statistics.nullCounts[col.name] = 0;
              statistics.uniqueCounts[col.name] = 0;
            });
          }

          // Add to current batch
          currentBatch.push(...data);
          processedRows += data.length;

          // Collect sample data
          if (sampleData.length < this.SAMPLE_SIZE) {
            sampleData.push(...data.slice(0, this.SAMPLE_SIZE - sampleData.length));
          }

          // Process batch when it reaches the size limit
          if (currentBatch.length >= this.BATCH_SIZE) {
            batchNumber++;
            if (onBatch) {
              await onBatch(currentBatch, batchNumber);
            }

            // Update statistics
            this.updateStatistics(currentBatch, schema!, statistics);

            // Update progress
            if (onProgress) {
              const progress = Math.round((processedRows / totalRows) * 100);
              await onProgress(progress, processedRows, totalRows);
            }

            // Update job progress in database
            await prisma.fileProcessingJob.update({
              where: { id: jobId },
              data: {
                progressPercent: Math.round((processedRows / totalRows) * 100),
                processedRows,
                totalRows
              }
            });

            currentBatch = [];
          }
        },
        complete: async () => {
          // Process remaining data
          if (currentBatch.length > 0 && onBatch) {
            batchNumber++;
            await onBatch(currentBatch, batchNumber);
            this.updateStatistics(currentBatch, schema!, statistics);
          }

          if (!schema) {
            reject(new Error('Failed to infer schema from CSV'));
            return;
          }

          resolve({
            tableName,
            schema,
            rowCount: processedRows,
            processedRows,
            sampleData,
            statistics
          });
        },
        error: (error: any) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        }
      });
    });
  }

  /**
   * Process Excel in batches
   */
  private static async processExcelInBatches(
    buffer: Buffer,
    filename: string,
    jobId: string,
    onProgress?: (progress: number, processedRows: number, totalRows: number) => Promise<void>,
    onBatch?: (batchData: any[], batchNumber: number) => Promise<void>
  ): Promise<BatchProcessingResult> {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert to JSON
      const data = XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
        raw: false
      });

      const tableName = this.generateTableName(filename);
      const schema = this.inferSchema(data);
      const totalRows = data.length;
      let processedRows = 0;
      let batchNumber = 0;
      const sampleData = data.slice(0, this.SAMPLE_SIZE);
      const statistics = this.calculateStatistics(data, schema);

      // Process in batches
      for (let i = 0; i < data.length; i += this.BATCH_SIZE) {
        const batch = data.slice(i, i + this.BATCH_SIZE);
        batchNumber++;
        
        if (onBatch) {
          await onBatch(batch, batchNumber);
        }

        processedRows += batch.length;

        if (onProgress) {
          const progress = Math.round((processedRows / totalRows) * 100);
          await onProgress(progress, processedRows, totalRows);
        }

        // Update job progress
        await prisma.fileProcessingJob.update({
          where: { id: jobId },
          data: {
            progressPercent: Math.round((processedRows / totalRows) * 100),
            processedRows,
            totalRows
          }
        });
      }

      return {
        tableName,
        schema,
        rowCount: totalRows,
        processedRows,
        sampleData,
        statistics
      };
    } catch (error) {
      throw new Error(`Excel processing error: ${(error as Error).message}`);
    }
  }

  /**
   * Infer schema from data
   */
  private static inferSchema(data: any[]): FileSchema {
    if (!data || data.length === 0) {
      return { columns: [], rowCount: 0, sampleData: [] };
    }

    const columns = Object.keys(data[0]).map(name => {
      const sampleValues = data
        .slice(0, 100)
        .map(row => row[name])
        .filter(val => val != null);

      let type: 'string' | 'number' | 'boolean' | 'date' = 'string';
      
      if (sampleValues.length > 0) {
        const allNumbers = sampleValues.every(val => !isNaN(Number(val)));
        const allBooleans = sampleValues.every(val => 
          typeof val === 'boolean' || val === 'true' || val === 'false'
        );
        const allDates = sampleValues.every(val => {
          const date = new Date(val);
          return date instanceof Date && !isNaN(date.getTime());
        });

        if (allNumbers) {
          type = 'number';
        } else if (allBooleans) {
          type = 'boolean';
        } else if (allDates && !allNumbers) {
          type = 'date';
        }
      }

      return { name, type };
    });

    return {
      columns,
      rowCount: data.length,
      sampleData: data.slice(0, 3)
    };
  }

  /**
   * Update statistics incrementally
   */
  private static updateStatistics(
    batch: any[],
    schema: FileSchema,
    stats: BatchProcessingResult['statistics']!
  ) {
    for (const column of schema.columns) {
      const values = batch.map(row => row[column.name]);
      
      // Count nulls
      stats.nullCounts[column.name] += values.filter(v => v == null).length;
      
      // Update unique count (approximate)
      const uniqueInBatch = new Set(values.filter(v => v != null)).size;
      stats.uniqueCounts[column.name] = Math.max(
        stats.uniqueCounts[column.name],
        uniqueInBatch
      );
      
      // Min/max for numeric columns
      if (column.type === 'number') {
        const numericValues = values
          .filter(v => v != null && !isNaN(Number(v)))
          .map(Number);
        
        if (numericValues.length > 0) {
          const batchMin = Math.min(...numericValues);
          const batchMax = Math.max(...numericValues);
          
          stats.minValues![column.name] = stats.minValues![column.name] !== undefined
            ? Math.min(stats.minValues![column.name], batchMin)
            : batchMin;
            
          stats.maxValues![column.name] = stats.maxValues![column.name] !== undefined
            ? Math.max(stats.maxValues![column.name], batchMax)
            : batchMax;
        }
      }
    }
  }

  /**
   * Calculate statistics for the entire dataset
   */
  private static calculateStatistics(data: any[], schema: FileSchema) {
    const stats: BatchProcessingResult['statistics'] = {
      nullCounts: {},
      uniqueCounts: {},
      minValues: {},
      maxValues: {}
    };

    for (const column of schema.columns) {
      const values = data.map(row => row[column.name]);
      
      stats.nullCounts[column.name] = values.filter(v => v == null).length;
      stats.uniqueCounts[column.name] = new Set(values.filter(v => v != null)).size;
      
      if (column.type === 'number') {
        const numericValues = values
          .filter(v => v != null && !isNaN(Number(v)))
          .map(Number);
        
        if (numericValues.length > 0) {
          stats.minValues![column.name] = Math.min(...numericValues);
          stats.maxValues![column.name] = Math.max(...numericValues);
        }
      }
    }

    return stats;
  }

  /**
   * Generate a safe table name
   */
  private static generateTableName(filename: string): string {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const safeName = nameWithoutExt
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+/, '')
      .replace(/_+$/, '')
      .replace(/_+/g, '_');
    
    const timestamp = Date.now().toString(36);
    return `user_data_${safeName}_${timestamp}`;
  }
}