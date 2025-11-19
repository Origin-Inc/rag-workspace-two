/**
 * File Parser Client Service
 *
 * Client-side file parsing using Web Workers for large files (>5MB).
 * Processes files in background thread to prevent UI blocking.
 * Falls back to server-side parsing if workers unavailable.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParsedFileData, FileColumn } from './file-parser.server';

// Threshold for using web worker (10MB)
// Increased to reduce stream locking issues with smaller files
const WORKER_THRESHOLD = 10 * 1024 * 1024;

interface ParseProgress {
  loaded: number;
  total: number;
  percent: number;
  status: 'parsing' | 'processing' | 'complete';
}

interface ParseOptions {
  onProgress?: (progress: ParseProgress) => void;
  useWorker?: boolean;
}

/**
 * Parse file in web worker for better performance with large files
 */
export async function parseFileInWorker(
  file: File,
  options: ParseOptions = {}
): Promise<ParsedFileData | null> {
  const { onProgress, useWorker = file.size > WORKER_THRESHOLD } = options;

  // Check file extension
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  const isCSV = extension === '.csv';
  const isExcel = ['.xlsx', '.xls'].includes(extension);

  if (!isCSV && !isExcel) {
    throw new Error(`Unsupported file type: ${extension}`);
  }

  // For CSV files, use PapaParse with worker if available
  if (isCSV) {
    return parseCSVInWorker(file, onProgress, useWorker);
  }

  // For Excel files, parse in main thread (SheetJS doesn't support workers well)
  // But we can still provide progress updates
  return parseExcelInMainThread(file, onProgress);
}

/**
 * Parse CSV file using PapaParse with optional web worker
 */
async function parseCSVInWorker(
  file: File,
  onProgress?: (progress: ParseProgress) => void,
  useWorker = true
): Promise<ParsedFileData> {
  return new Promise((resolve, reject) => {
    let rowCount = 0;
    const rows: any[] = [];
    let headers: string[] = [];

    Papa.parse(file, {
      worker: useWorker && typeof Worker !== 'undefined',
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      chunk: (results, parser) => {
        // First chunk - capture headers
        if (headers.length === 0 && results.meta.fields) {
          headers = results.meta.fields;
        }

        // Add rows from this chunk
        rows.push(...results.data);
        rowCount += results.data.length;

        // Report progress
        if (onProgress && file.size > 0) {
          const progress: ParseProgress = {
            loaded: results.meta.cursor || 0,
            total: file.size,
            percent: Math.min(90, Math.round((results.meta.cursor / file.size) * 100)),
            status: 'parsing'
          };
          onProgress(progress);
        }
      },
      complete: (results) => {
        // Process final results
        if (onProgress) {
          onProgress({
            loaded: file.size,
            total: file.size,
            percent: 95,
            status: 'processing'
          });
        }

        // Infer column types
        const columns = inferColumnTypes(headers, rows);

        // Generate row IDs and transform data
        const transformedRows = rows.map((row, index) => ({
          id: `row_${index + 1}`,
          ...row
        }));

        const parsedData: ParsedFileData = {
          columns,
          rows: transformedRows,
          filename: file.name,
          rowCount: rows.length,
          columnCount: headers.length
        };

        if (onProgress) {
          onProgress({
            loaded: file.size,
            total: file.size,
            percent: 100,
            status: 'complete'
          });
        }

        resolve(parsedData);
      },
      error: (error) => {
        console.error('[CSV Worker Parse Error]', error);
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      }
    });
  });
}

/**
 * Parse Excel file in main thread (with progress simulation)
 */
async function parseExcelInMainThread(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): Promise<ParsedFileData> {
  try {
    // Start progress
    if (onProgress) {
      onProgress({
        loaded: 0,
        total: file.size,
        percent: 10,
        status: 'parsing'
      });
    }

    // Read file as array buffer
    const buffer = await file.arrayBuffer();

    if (onProgress) {
      onProgress({
        loaded: file.size,
        total: file.size,
        percent: 50,
        status: 'parsing'
      });
    }

    // Parse with SheetJS
    const workbook = XLSX.read(buffer, { type: 'array' });

    // Get first sheet
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('No sheets found in Excel file');
    }

    const worksheet = workbook.Sheets[firstSheetName];

    if (onProgress) {
      onProgress({
        loaded: file.size,
        total: file.size,
        percent: 70,
        status: 'processing'
      });
    }

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      blankrows: false
    });

    if (jsonData.length === 0) {
      throw new Error('Excel file is empty');
    }

    // Extract headers and data
    const headers = jsonData[0] as string[];
    const dataRows = jsonData.slice(1) as any[][];

    // Convert array data to objects
    const rows = dataRows.map((row, rowIndex) => {
      const obj: any = { id: `row_${rowIndex + 1}` };
      headers.forEach((header, colIndex) => {
        obj[header] = row[colIndex] ?? null;
      });
      return obj;
    });

    if (onProgress) {
      onProgress({
        loaded: file.size,
        total: file.size,
        percent: 90,
        status: 'processing'
      });
    }

    // Infer column types
    const columns = inferColumnTypes(headers, rows);

    const parsedData: ParsedFileData = {
      columns,
      rows,
      filename: file.name,
      rowCount: rows.length,
      columnCount: headers.length
    };

    if (onProgress) {
      onProgress({
        loaded: file.size,
        total: file.size,
        percent: 100,
        status: 'complete'
      });
    }

    return parsedData;
  } catch (error) {
    console.error('[Excel Parse Error]', error);
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Infer column types from data (same logic as server-side)
 */
function inferColumnTypes(headers: string[], rows: any[]): FileColumn[] {
  return headers.map((header, index) => {
    const columnId = `col_${index + 1}`;

    // Sample values for type inference
    const sampleSize = Math.min(100, rows.length);
    const samples = rows.slice(0, sampleSize).map(row => row[header]);

    // Count type occurrences
    let numberCount = 0;
    let booleanCount = 0;
    let dateCount = 0;
    let nonNullCount = 0;

    samples.forEach(value => {
      if (value === null || value === undefined || value === '') return;

      nonNullCount++;

      if (typeof value === 'number' && !isNaN(value)) {
        numberCount++;
      } else if (typeof value === 'boolean' ||
                 (typeof value === 'string' && /^(true|false)$/i.test(value))) {
        booleanCount++;
      } else if (isValidDate(value)) {
        dateCount++;
      }
    });

    // Determine type based on 70% threshold
    let type: 'text' | 'number' | 'boolean' | 'date' = 'text';
    if (nonNullCount > 0) {
      const threshold = 0.7;
      if (numberCount / nonNullCount >= threshold) {
        type = 'number';
      } else if (booleanCount / nonNullCount >= threshold) {
        type = 'boolean';
      } else if (dateCount / nonNullCount >= threshold) {
        type = 'date';
      }
    }

    return {
      id: columnId,
      name: header || `Column ${index + 1}`,
      type,
      width: 150
    };
  });
}

/**
 * Check if value is a valid date
 */
function isValidDate(value: any): boolean {
  if (!value) return false;

  // Check for Date object
  if (value instanceof Date) {
    return !isNaN(value.getTime());
  }

  // Check for common date string formats
  if (typeof value === 'string') {
    const dateFormats = [
      /^\d{4}-\d{2}-\d{2}$/,           // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/,         // MM/DD/YYYY
      /^\d{2}-\d{2}-\d{4}$/,           // MM-DD-YYYY
      /^\d{4}\/\d{2}\/\d{2}$/,         // YYYY/MM/DD
    ];

    if (dateFormats.some(format => format.test(value))) {
      const date = new Date(value);
      return !isNaN(date.getTime());
    }
  }

  // Check for Excel serial date numbers (days since 1900-01-01)
  if (typeof value === 'number' && value > 0 && value < 100000) {
    return true; // Likely an Excel date
  }

  return false;
}

/**
 * Check if Web Workers are supported
 */
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined';
}

/**
 * Get file size threshold for using workers
 */
export function getWorkerThreshold(): number {
  return WORKER_THRESHOLD;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}