/**
 * File Parser Service
 *
 * Parses CSV and Excel files, infers column types, and prepares data for SpreadsheetBlock creation.
 * Supports server-side parsing with PapaParse (CSV) and SheetJS (Excel).
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type ColumnType = 'text' | 'number' | 'boolean' | 'date';

export interface ParsedColumn {
  id: string;
  name: string;
  type: ColumnType;
  width?: number;
}

export interface ParsedRow {
  id: string;
  [columnId: string]: any;
}

export interface ParsedFileData {
  columns: ParsedColumn[];
  rows: ParsedRow[];
  filename: string;
  rowCount: number;
  columnCount: number;
}

/**
 * Main file parser function
 * @param file - File object or Buffer with filename and mimetype
 * @returns Parsed data with inferred schema
 */
export async function parseFile(
  file: File | { buffer: Buffer; filename: string; mimetype: string }
): Promise<ParsedFileData> {
  const isFileObject = file instanceof File;
  const filename = isFileObject ? file.name : file.filename;
  const extension = filename.split('.').pop()?.toLowerCase();

  let buffer: Buffer;
  if (isFileObject) {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    buffer = file.buffer;
  }

  switch (extension) {
    case 'csv':
      return await parseCSV(buffer, filename);
    case 'xlsx':
    case 'xls':
      return await parseExcel(buffer, filename);
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

/**
 * Parse CSV file using PapaParse
 */
async function parseCSV(buffer: Buffer, filename: string): Promise<ParsedFileData> {
  const text = buffer.toString('utf-8');

  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      dynamicTyping: false, // We'll handle type inference ourselves
      skipEmptyLines: true,
      complete: (results) => {
        try {
          if (results.errors.length > 0) {
            console.error('CSV parse errors:', results.errors);
          }

          const rawData = results.data as Record<string, any>[];

          if (rawData.length === 0) {
            throw new Error('CSV file is empty');
          }

          // Extract headers
          const headers = results.meta.fields || Object.keys(rawData[0]);

          // Infer schema from data
          const schema = inferSchema(rawData, headers);

          // Generate column IDs
          const columns: ParsedColumn[] = schema.map((col, index) => ({
            id: `col_${index + 1}`,
            name: col.name,
            type: col.type,
            width: 150,
          }));

          // Transform rows to use column IDs
          const rows: ParsedRow[] = rawData.map((row, rowIndex) => {
            const transformedRow: ParsedRow = {
              id: `row_${rowIndex + 1}`,
            };

            columns.forEach((col, colIndex) => {
              const headerName = headers[colIndex];
              const value = row[headerName];
              transformedRow[col.id] = parseValue(value, col.type);
            });

            return transformedRow;
          });

          resolve({
            columns,
            rows,
            filename,
            rowCount: rows.length,
            columnCount: columns.length,
          });
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      },
    });
  });
}

/**
 * Parse Excel file using SheetJS
 */
async function parseExcel(buffer: Buffer, filename: string): Promise<ParsedFileData> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Get first sheet
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('Excel file contains no sheets');
    }

    const worksheet = workbook.Sheets[firstSheetName];

    // Convert to JSON with header row
    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      defval: '', // Default value for empty cells
      raw: false, // Return formatted strings
    }) as Record<string, any>[];

    if (rawData.length === 0) {
      throw new Error('Excel sheet is empty');
    }

    // Extract headers from first row
    const headers = Object.keys(rawData[0]);

    // Infer schema
    const schema = inferSchema(rawData, headers);

    // Generate columns
    const columns: ParsedColumn[] = schema.map((col, index) => ({
      id: `col_${index + 1}`,
      name: col.name,
      type: col.type,
      width: 150,
    }));

    // Transform rows
    const rows: ParsedRow[] = rawData.map((row, rowIndex) => {
      const transformedRow: ParsedRow = {
        id: `row_${rowIndex + 1}`,
      };

      columns.forEach((col, colIndex) => {
        const headerName = headers[colIndex];
        const value = row[headerName];
        transformedRow[col.id] = parseValue(value, col.type);
      });

      return transformedRow;
    });

    return {
      columns,
      rows,
      filename: `${filename} (${firstSheetName})`,
      rowCount: rows.length,
      columnCount: columns.length,
    };
  } catch (error) {
    throw new Error(`Excel parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Infer column types from data
 */
function inferSchema(
  data: Record<string, any>[],
  headers: string[]
): Array<{ name: string; type: ColumnType }> {
  const sampleSize = Math.min(100, data.length); // Sample first 100 rows

  return headers.map((header) => {
    const values = data.slice(0, sampleSize).map((row) => row[header]);
    const inferredType = inferColumnType(values);

    return {
      name: header || 'Unnamed',
      type: inferredType,
    };
  });
}

/**
 * Infer type for a single column based on values
 */
function inferColumnType(values: any[]): ColumnType {
  const nonEmptyValues = values.filter((v) => v !== null && v !== undefined && v !== '');

  if (nonEmptyValues.length === 0) {
    return 'text';
  }

  let numberCount = 0;
  let booleanCount = 0;
  let dateCount = 0;

  for (const value of nonEmptyValues) {
    const str = String(value).trim().toLowerCase();

    // Check boolean
    if (str === 'true' || str === 'false' || str === 'yes' || str === 'no' || str === '1' || str === '0') {
      booleanCount++;
      continue;
    }

    // Check number
    if (!isNaN(Number(str)) && str !== '') {
      numberCount++;
      continue;
    }

    // Check date
    const dateValue = new Date(value);
    if (!isNaN(dateValue.getTime()) && isLikelyDate(str)) {
      dateCount++;
      continue;
    }
  }

  const total = nonEmptyValues.length;

  // If >= 70% of values match a type, use that type
  if (booleanCount / total >= 0.7) return 'boolean';
  if (numberCount / total >= 0.7) return 'number';
  if (dateCount / total >= 0.7) return 'date';

  return 'text';
}

/**
 * Check if string is likely a date
 */
function isLikelyDate(str: string): boolean {
  // Date patterns
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}/, // MM/DD/YYYY
    /^\d{2}-\d{2}-\d{4}/, // MM-DD-YYYY
    /^\d{4}\/\d{2}\/\d{2}/, // YYYY/MM/DD
  ];

  return datePatterns.some((pattern) => pattern.test(str));
}

/**
 * Parse value according to inferred type
 */
function parseValue(value: any, type: ColumnType): any {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const str = String(value).trim();

  switch (type) {
    case 'number':
      const num = Number(str);
      return isNaN(num) ? str : num;

    case 'boolean':
      const lower = str.toLowerCase();
      if (lower === 'true' || lower === 'yes' || lower === '1') return true;
      if (lower === 'false' || lower === 'no' || lower === '0') return false;
      return str;

    case 'date':
      const date = new Date(str);
      return isNaN(date.getTime()) ? str : date.toISOString();

    case 'text':
    default:
      return str;
  }
}

/**
 * Validate file before parsing
 */
export function validateFile(filename: string, size: number): { valid: boolean; error?: string } {
  const extension = filename.split('.').pop()?.toLowerCase();
  const maxSize = 50 * 1024 * 1024; // 50MB

  if (!extension || !['csv', 'xlsx', 'xls'].includes(extension)) {
    return {
      valid: false,
      error: 'Only CSV and Excel files (.csv, .xlsx, .xls) are supported',
    };
  }

  if (size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds 50MB limit (${(size / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  return { valid: true };
}
