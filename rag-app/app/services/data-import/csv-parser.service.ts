import Papa from 'papaparse';
import type { DatabaseColumn } from '~/types/database-block';

export interface ParseResult {
  columns: DatabaseColumn[];
  rows: any[];
  errors: string[];
}

export interface ParseProgress {
  loaded: number;
  total: number;
  percent: number;
}

export class CSVParserService {
  /**
   * Parse a CSV file and infer schema
   */
  static async parseCSV(
    file: File,
    onProgress?: (progress: ParseProgress) => void
  ): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      const columns: DatabaseColumn[] = [];
      const rows: any[] = [];
      const errors: string[] = [];
      let headers: string[] = [];
      let isFirstRow = true;

      Papa.parse(file, {
        header: true,
        dynamicTyping: true, // Automatically detect numbers
        skipEmptyLines: true,
        chunk: (results, parser) => {
          // Process chunk
          if (isFirstRow && results.meta.fields) {
            headers = results.meta.fields;
            isFirstRow = false;
          }

          // Add rows from this chunk
          rows.push(...results.data);

          // Report progress
          if (onProgress) {
            const progress: ParseProgress = {
              loaded: rows.length,
              total: Math.ceil(file.size / 1000), // Rough estimate
              percent: Math.min(99, (rows.length / 1000) * 100) // Cap at 99% until complete
            };
            onProgress(progress);
          }
        },
        complete: () => {
          // Infer column types from first 100 rows
          const sampleRows = rows.slice(0, 100);
          const inferredColumns = this.inferSchema(headers, sampleRows);

          if (onProgress) {
            onProgress({ loaded: rows.length, total: rows.length, percent: 100 });
          }

          resolve({
            columns: inferredColumns,
            rows: this.transformRows(rows, inferredColumns),
            errors
          });
        },
        error: (error) => {
          errors.push(error.message);
          reject(new Error(`CSV parsing failed: ${error.message}`));
        }
      });
    });
  }

  /**
   * Infer column types from sample data
   */
  private static inferSchema(headers: string[], sampleRows: any[]): DatabaseColumn[] {
    return headers.map((header, index) => {
      const columnId = this.sanitizeColumnId(header);
      const values = sampleRows.map(row => row[header]).filter(v => v !== null && v !== undefined);
      const columnType = this.inferColumnType(values);

      return {
        id: columnId,
        name: header,
        type: columnType,
        position: index,
        width: this.calculateColumnWidth(header, columnType, values)
      } as DatabaseColumn;
    });
  }

  /**
   * Infer column type from sample values
   */
  private static inferColumnType(values: any[]): DatabaseColumn['type'] {
    if (values.length === 0) return 'text';

    const types = {
      boolean: 0,
      number: 0,
      date: 0,
      email: 0,
      url: 0,
      text: 0
    };

    for (const value of values) {
      if (typeof value === 'boolean' || 
          (typeof value === 'string' && ['true', 'false', 'yes', 'no'].includes(value.toLowerCase()))) {
        types.boolean++;
      } else if (typeof value === 'number' || 
                 (typeof value === 'string' && !isNaN(Number(value)) && value.trim() !== '')) {
        types.number++;
      } else if (this.isDate(value)) {
        types.date++;
      } else if (this.isEmail(String(value))) {
        types.email++;
      } else if (this.isURL(String(value))) {
        types.url++;
      } else {
        types.text++;
      }
    }

    // Return the most common type (with at least 60% confidence)
    const threshold = values.length * 0.6;
    
    if (types.boolean >= threshold) return 'checkbox';
    if (types.number >= threshold) return 'number';
    if (types.date >= threshold) return 'date';
    if (types.email >= threshold) return 'email';
    if (types.url >= threshold) return 'url';
    
    return 'text';
  }

  /**
   * Check if value is a valid date
   */
  private static isDate(value: any): boolean {
    if (!value) return false;
    
    // Common date formats
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,           // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/,         // MM/DD/YYYY
      /^\d{2}-\d{2}-\d{4}$/,           // DD-MM-YYYY
      /^\d{4}\/\d{2}\/\d{2}$/,         // YYYY/MM/DD
    ];

    const str = String(value);
    const hasDatePattern = datePatterns.some(pattern => pattern.test(str));
    
    if (hasDatePattern) {
      const date = new Date(str);
      return !isNaN(date.getTime());
    }

    return false;
  }

  /**
   * Check if value is an email
   */
  private static isEmail(value: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
  }

  /**
   * Check if value is a URL
   */
  private static isURL(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitize column ID (remove spaces, special chars)
   */
  private static sanitizeColumnId(header: string): string {
    return header
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_') || `col_${Date.now()}`;
  }

  /**
   * Calculate appropriate column width
   */
  private static calculateColumnWidth(
    header: string, 
    type: DatabaseColumn['type'], 
    values: any[]
  ): number {
    const headerWidth = header.length * 10;
    const minWidth = 100;
    const maxWidth = 300;

    let contentWidth = minWidth;

    if (type === 'checkbox') {
      contentWidth = 60;
    } else if (type === 'number') {
      contentWidth = 120;
    } else if (type === 'date' || type === 'datetime') {
      contentWidth = 150;
    } else if (type === 'email' || type === 'url') {
      contentWidth = 200;
    } else {
      // For text, calculate based on average content length
      const avgLength = values
        .slice(0, 20)
        .reduce((sum, v) => sum + String(v || '').length, 0) / Math.min(values.length, 20);
      contentWidth = Math.min(maxWidth, avgLength * 8);
    }

    return Math.max(minWidth, Math.min(maxWidth, Math.max(headerWidth, contentWidth)));
  }

  /**
   * Transform rows to match database block format
   */
  private static transformRows(rows: any[], columns: DatabaseColumn[]): any[] {
    return rows.map((row, index) => {
      const cells: Record<string, any> = {};
      
      for (const column of columns) {
        const originalHeader = column.name;
        let value = row[originalHeader];

        // Transform value based on column type
        if (column.type === 'checkbox') {
          if (typeof value === 'string') {
            value = ['true', 'yes', '1', 'on'].includes(value.toLowerCase());
          } else {
            value = Boolean(value);
          }
        } else if (column.type === 'number') {
          value = Number(value) || 0;
        } else if (column.type === 'date' && value) {
          value = new Date(value).toISOString();
        } else if (value === null || value === undefined) {
          value = '';
        }

        cells[column.id] = value;
      }

      return {
        id: `row_${index + 1}`,
        cells,
        position: index
      };
    });
  }

  /**
   * Validate CSV data before import
   */
  static validateData(columns: DatabaseColumn[], rows: any[]): string[] {
    const errors: string[] = [];

    if (columns.length === 0) {
      errors.push('No columns found in CSV file');
    }

    if (rows.length === 0) {
      errors.push('No data rows found in CSV file');
    }

    if (columns.length > 100) {
      errors.push('Too many columns (max 100)');
    }

    if (rows.length > 50000) {
      errors.push('Too many rows (max 50,000)');
    }

    // Check for duplicate column names
    const columnNames = new Set<string>();
    for (const column of columns) {
      if (columnNames.has(column.name)) {
        errors.push(`Duplicate column name: ${column.name}`);
      }
      columnNames.add(column.name);
    }

    return errors;
  }
}