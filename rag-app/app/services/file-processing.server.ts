import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParseResult } from 'papaparse';

export interface ColumnSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime';
  nullable: boolean;
  sampleValues: any[];
}

export interface FileSchema {
  columns: ColumnSchema[];
  rowCount: number;
  sampleData: Record<string, any>[];
}

export class FileProcessingService {
  private static readonly MAX_SAMPLE_ROWS = 100;
  private static readonly DATE_PATTERNS = [
    /^\d{4}-\d{2}-\d{2}$/,  // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
    /^\d{2}-\d{2}-\d{4}$/,   // DD-MM-YYYY
  ];
  
  private static readonly DATETIME_PATTERNS = [
    /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/, // ISO datetime
    /^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}:\d{2}/, // MM/DD/YYYY HH:mm:ss
  ];

  static async parseCSV(file: File): Promise<{ data: any[], schema: FileSchema }> {
    return new Promise(async (resolve, reject) => {
      try {
        // Convert File to text for server-side parsing
        const text = await file.text();

        Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (result: ParseResult<any>) => {
            if (result.errors.length > 0) {
              console.warn('CSV parsing warnings:', result.errors);
            }

            const schema = this.inferSchema(result.data);
            resolve({ data: result.data, schema });
          },
          error: (error) => {
            reject(new Error(`Failed to parse CSV: ${error.message}`));
          }
        });
      } catch (error) {
        reject(new Error(`Failed to read CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  static async parseExcel(file: File): Promise<{ data: any[], schema: FileSchema, sheets?: string[] }> {
    console.log(`[Excel] Starting parse: ${file.name} (${file.size} bytes)`);
    
    try {
      // Check if arrayBuffer method exists
      if (typeof file.arrayBuffer !== 'function') {
        console.error(`[Excel] File.arrayBuffer() method not available`);
        throw new Error('File.arrayBuffer() method not available in this environment');
      }
      
      // Use the File object's built-in arrayBuffer() method
      console.log(`[Excel] Converting to buffer...`);
      const buffer = await file.arrayBuffer();
      console.log(`[Excel] Buffer created: ${buffer.byteLength} bytes`);
      
      const data = new Uint8Array(buffer);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      
      // Get all sheet names
      const sheets = workbook.SheetNames;
      console.log(`[Excel] Found ${sheets.length} sheets: ${sheets.join(', ')}`);
      
      // Use first sheet by default
      const worksheet = workbook.Sheets[sheets[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        raw: false,
        dateNF: 'yyyy-mm-dd'
      });
      
      console.log(`[Excel] Parsed ${jsonData.length} rows from sheet: ${sheets[0]}`);
      
      const schema = this.inferSchema(jsonData);
      console.log(`[Excel] Schema inferred: ${schema.columns.length} columns`);
      
      return { data: jsonData, schema, sheets };
    } catch (error) {
      console.error(`[Excel] Parse failed:`, error);
      console.error(`[Excel] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
      throw new Error(`Failed to parse Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static inferSchema(data: any[]): FileSchema {
    if (!data || data.length === 0) {
      return { columns: [], rowCount: 0, sampleData: [] };
    }
    
    const sampleSize = Math.min(this.MAX_SAMPLE_ROWS, data.length);
    const sampleData = data.slice(0, 10); // First 10 rows for preview
    
    // Get all unique column names
    const columnNames = new Set<string>();
    data.slice(0, sampleSize).forEach(row => {
      Object.keys(row).forEach(key => columnNames.add(key));
    });
    
    const columns: ColumnSchema[] = Array.from(columnNames).map(columnName => {
      const values = data
        .slice(0, sampleSize)
        .map(row => row[columnName])
        .filter(val => val !== null && val !== undefined && val !== '');
      
      const columnSchema: ColumnSchema = {
        name: columnName,
        type: this.detectColumnType(values),
        nullable: values.length < sampleSize,
        sampleValues: values.slice(0, 5)
      };
      
      return columnSchema;
    });
    
    return {
      columns,
      rowCount: data.length,
      sampleData
    };
  }

  private static detectColumnType(values: any[]): ColumnSchema['type'] {
    if (values.length === 0) return 'string';
    
    const types = new Map<string, number>();
    
    values.forEach(value => {
      const type = this.detectValueType(value);
      types.set(type, (types.get(type) || 0) + 1);
    });
    
    // Find the most common type
    let maxCount = 0;
    let dominantType: ColumnSchema['type'] = 'string';
    
    types.forEach((count, type) => {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type as ColumnSchema['type'];
      }
    });
    
    // If more than 80% of values match the dominant type, use it
    const threshold = values.length * 0.8;
    return maxCount >= threshold ? dominantType : 'string';
  }

  private static detectValueType(value: any): ColumnSchema['type'] {
    if (value === null || value === undefined) return 'string';
    
    // Check boolean
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === 'false') return 'boolean';
    }
    
    // Check number
    if (typeof value === 'number' && !isNaN(value)) return 'number';
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed) && parsed.toString() === value.trim()) return 'number';
    }
    
    // Check dates
    if (value instanceof Date) return 'datetime';
    if (typeof value === 'string') {
      // Check datetime patterns first
      for (const pattern of this.DATETIME_PATTERNS) {
        if (pattern.test(value)) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) return 'datetime';
        }
      }
      
      // Check date patterns
      for (const pattern of this.DATE_PATTERNS) {
        if (pattern.test(value)) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) return 'date';
        }
      }
    }
    
    return 'string';
  }

  static sanitizeTableName(fileName: string): string {
    // Remove file extension
    let tableName = fileName.replace(/\.[^/.]+$/, '');
    
    // Replace spaces and special characters with underscores
    tableName = tableName.replace(/[^a-zA-Z0-9]/g, '_');
    
    // Remove consecutive underscores
    tableName = tableName.replace(/_+/g, '_');
    
    // Remove leading/trailing underscores
    tableName = tableName.replace(/^_+|_+$/g, '');
    
    // Ensure it starts with a letter (add 't_' prefix if it doesn't)
    if (!/^[a-zA-Z]/.test(tableName)) {
      tableName = 't_' + tableName;
    }
    
    // Truncate to reasonable length
    if (tableName.length > 50) {
      tableName = tableName.substring(0, 50);
    }
    
    // Add timestamp to ensure uniqueness
    const timestamp = Date.now().toString(36);
    tableName = `${tableName}_${timestamp}`;
    
    return tableName.toLowerCase();
  }

  static async processFile(file: File): Promise<{
    data: any[];
    schema: FileSchema;
    tableName: string;
    sheets?: string[];
  }> {
    console.log(`[FileProcessing] Processing file: ${file.name}`);
    console.log(`[FileProcessing] File size: ${file.size} bytes, Type: ${file.type || 'unknown'}`);

    // Validate file size (50MB limit)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      console.error(`[FileProcessing] File too large: ${file.size} bytes (max: ${MAX_FILE_SIZE})`);
      throw new Error(`File "${file.name}" is too large. Maximum size is 50MB.`);
    }

    let result;

    try {
      if (file.name.toLowerCase().endsWith('.csv')) {
        console.log(`[FileProcessing] Detected CSV file, parsing...`);
        result = await this.parseCSV(file);
      } else if (file.name.toLowerCase().match(/\.(xlsx?|xls)$/)) {
        console.log(`[FileProcessing] Detected Excel file, parsing...`);
        result = await this.parseExcel(file);
      } else {
        console.error(`[FileProcessing] Unsupported file type: ${file.name}`);
        throw new Error(`Unsupported file type: ${file.name}. Only CSV and Excel files are supported.`);
      }

      const tableName = this.sanitizeTableName(file.name);
      console.log(`[FileProcessing] Generated table name: ${tableName}`);

      return {
        ...result,
        tableName
      };
    } catch (error) {
      console.error(`[FileProcessing] Failed to process file:`, error);
      throw error;
    }
  }

  /**
   * PROGRESSIVE LOADING METHODS
   * Task #80: Implement Progressive Data Loading
   *
   * These methods enable chunked file processing to prevent memory issues
   * with large datasets (100K+ rows)
   */

  /**
   * Process file progressively in chunks
   * Returns an AsyncGenerator that yields data chunks
   *
   * @param file - File to process
   * @param options - Progressive loading options
   */
  static async *processFileProgressive(
    file: File,
    options?: {
      chunkSize?: number;
      onProgress?: (info: { loadedRows: number; totalRows: number; percentComplete: number }) => void;
    }
  ): AsyncGenerator<{
    chunk: any[];
    chunkIndex: number;
    schema?: FileSchema;
    tableName: string;
  }> {
    console.log(`[FileProcessing] Processing file progressively: ${file.name}`);

    const { ProgressiveDataLoader } = await import('~/services/shared/progressive-loader.server');
    const loader = new ProgressiveDataLoader(options);

    const tableName = this.sanitizeTableName(file.name);
    let schema: FileSchema | undefined;
    let chunkIndex = 0;

    try {
      // Get metadata first for schema
      const metadata = await loader.getFileMetadata(file);
      schema = metadata.schema;

      console.log(`[FileProcessing] Progressive loading: ${metadata.totalRows} rows in ~${metadata.estimatedChunks} chunks`);

      // Yield chunks
      for await (const dataChunk of loader.loadFileInChunks(file)) {
        yield {
          chunk: dataChunk.data,
          chunkIndex: dataChunk.chunkIndex,
          schema: chunkIndex === 0 ? schema : undefined, // Only send schema with first chunk
          tableName
        };
        chunkIndex++;
      }

      console.log(`[FileProcessing] Progressive loading complete: ${chunkIndex} chunks processed`);
    } catch (error) {
      console.error(`[FileProcessing] Progressive loading failed:`, error);
      throw error;
    }
  }

  /**
   * Get file metadata without loading full content
   * Useful for showing file info before processing
   */
  static async getFileMetadata(file: File): Promise<{
    totalRows: number;
    schema: FileSchema;
    estimatedChunks: number;
    fileSizeBytes: number;
    tableName: string;
  }> {
    const { ProgressiveDataLoader } = await import('~/services/shared/progressive-loader.server');
    const loader = new ProgressiveDataLoader();

    const metadata = await loader.getFileMetadata(file);
    const tableName = this.sanitizeTableName(file.name);

    return {
      ...metadata,
      tableName
    };
  }

  /**
   * Check if a file should use progressive loading
   * Based on file size and row count estimates
   */
  static async shouldUseProgressiveLoading(file: File): Promise<boolean> {
    // Files over 10MB should use progressive loading
    const SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB

    if (file.size > SIZE_THRESHOLD) {
      return true;
    }

    // Try to estimate row count for smaller files
    try {
      const metadata = await this.getFileMetadata(file);
      // Files with over 50K rows should use progressive loading
      const ROW_THRESHOLD = 50000;
      return metadata.totalRows > ROW_THRESHOLD;
    } catch {
      // If we can't determine, use size-based decision
      return false;
    }
  }
}