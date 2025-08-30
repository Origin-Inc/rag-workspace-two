import * as XLSX from 'xlsx';
import type { DatabaseColumn } from '~/types/database-block';
import type { ParseResult, ParseProgress } from './csv-parser.service';

export interface ExcelSheet {
  name: string;
  rowCount: number;
  columnCount: number;
}

export class ExcelParserService {
  /**
   * Get list of sheets in an Excel file
   */
  static async getSheets(file: File): Promise<ExcelSheet[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          const sheets = workbook.SheetNames.map(name => {
            const worksheet = workbook.Sheets[name];
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
            
            return {
              name,
              rowCount: range.e.r - range.s.r + 1,
              columnCount: range.e.c - range.s.c + 1
            };
          });
          
          resolve(sheets);
        } catch (error) {
          reject(new Error(`Failed to read Excel file: ${(error as Error).message}`));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsBinaryString(file);
    });
  }

  /**
   * Parse an Excel file and infer schema
   */
  static async parseExcel(
    file: File,
    sheetName?: string,
    onProgress?: (progress: ParseProgress) => void
  ): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          if (onProgress) {
            onProgress({ loaded: 0, total: 100, percent: 10 });
          }
          
          const data = e.target?.result;
          const workbook = XLSX.read(data, { 
            type: 'binary',
            cellDates: true, // Parse dates as Date objects
            cellNF: false,   // Don't parse number formats
            cellText: false  // Don't generate formatted text
          });
          
          if (onProgress) {
            onProgress({ loaded: 30, total: 100, percent: 30 });
          }
          
          // Use specified sheet or first sheet
          const targetSheetName = sheetName || workbook.SheetNames[0];
          const worksheet = workbook.Sheets[targetSheetName];
          
          if (!worksheet) {
            throw new Error(`Sheet "${targetSheetName}" not found`);
          }
          
          if (onProgress) {
            onProgress({ loaded: 50, total: 100, percent: 50 });
          }
          
          // Convert to JSON with headers
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1, // Use array of arrays
            defval: null, // Default value for empty cells
            blankrows: false // Skip blank rows
          }) as any[][];
          
          if (jsonData.length === 0) {
            throw new Error('No data found in sheet');
          }
          
          if (onProgress) {
            onProgress({ loaded: 70, total: 100, percent: 70 });
          }
          
          // Extract headers and data
          const headers = jsonData[0].map(h => String(h || '').trim()).filter(h => h);
          const dataRows = jsonData.slice(1);
          
          // Convert to objects
          const rows = dataRows.map(row => {
            const obj: any = {};
            headers.forEach((header, index) => {
              obj[header] = row[index] ?? null;
            });
            return obj;
          });
          
          if (onProgress) {
            onProgress({ loaded: 85, total: 100, percent: 85 });
          }
          
          // Infer schema
          const columns = this.inferSchema(headers, rows);
          const transformedRows = this.transformRows(rows, columns);
          
          if (onProgress) {
            onProgress({ loaded: 100, total: 100, percent: 100 });
          }
          
          resolve({
            columns,
            rows: transformedRows,
            errors: []
          });
        } catch (error) {
          reject(new Error(`Excel parsing failed: ${(error as Error).message}`));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsBinaryString(file);
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
      currency: 0,
      percent: 0,
      email: 0,
      url: 0,
      text: 0
    };

    for (const value of values) {
      if (typeof value === 'boolean') {
        types.boolean++;
      } else if (value instanceof Date) {
        types.date++;
      } else if (typeof value === 'number') {
        // Check if it looks like currency or percent
        const strValue = String(value);
        if (strValue.includes('%')) {
          types.percent++;
        } else if (Math.abs(value) >= 100 && value % 1 !== 0 && (value * 100) % 1 === 0) {
          // Likely currency (has exactly 2 decimal places)
          types.currency++;
        } else {
          types.number++;
        }
      } else if (typeof value === 'string') {
        if (['true', 'false', 'yes', 'no'].includes(value.toLowerCase())) {
          types.boolean++;
        } else if (this.isEmail(value)) {
          types.email++;
        } else if (this.isURL(value)) {
          types.url++;
        } else if (value.startsWith('$') || value.match(/^\$?[\d,]+\.?\d*$/)) {
          types.currency++;
        } else if (value.endsWith('%') || value.match(/^\d+\.?\d*%$/)) {
          types.percent++;
        } else {
          types.text++;
        }
      } else {
        types.text++;
      }
    }

    // Return the most common type (with at least 60% confidence)
    const threshold = values.length * 0.6;
    
    if (types.boolean >= threshold) return 'checkbox';
    if (types.currency >= threshold) return 'currency';
    if (types.percent >= threshold) return 'percent';
    if (types.number >= threshold) return 'number';
    if (types.date >= threshold) return 'date';
    if (types.email >= threshold) return 'email';
    if (types.url >= threshold) return 'url';
    
    return 'text';
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
   * Sanitize column ID
   */
  private static sanitizeColumnId(header: string): string {
    return header
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_') || `col_${Date.now()}`;
  }

  /**
   * Calculate column width
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

    switch (type) {
      case 'checkbox':
        contentWidth = 60;
        break;
      case 'number':
      case 'percent':
        contentWidth = 120;
        break;
      case 'currency':
        contentWidth = 130;
        break;
      case 'date':
      case 'datetime':
        contentWidth = 150;
        break;
      case 'email':
      case 'url':
        contentWidth = 200;
        break;
      default:
        // For text, calculate based on average content length
        const avgLength = values
          .slice(0, 20)
          .reduce((sum, v) => sum + String(v || '').length, 0) / Math.min(values.length, 20);
        contentWidth = Math.min(maxWidth, avgLength * 8);
    }

    return Math.max(minWidth, Math.min(maxWidth, Math.max(headerWidth, contentWidth)));
  }

  /**
   * Transform rows to database block format
   */
  private static transformRows(rows: any[], columns: DatabaseColumn[]): any[] {
    return rows.map((row, index) => {
      const cells: Record<string, any> = {};
      
      for (const column of columns) {
        const originalHeader = column.name;
        let value = row[originalHeader];

        // Transform value based on column type
        switch (column.type) {
          case 'checkbox':
            if (typeof value === 'string') {
              value = ['true', 'yes', '1', 'on'].includes(value.toLowerCase());
            } else {
              value = Boolean(value);
            }
            break;
            
          case 'number':
            value = Number(value) || 0;
            break;
            
          case 'currency':
            if (typeof value === 'string') {
              value = Number(value.replace(/[$,]/g, '')) || 0;
            } else {
              value = Number(value) || 0;
            }
            break;
            
          case 'percent':
            if (typeof value === 'string') {
              value = Number(value.replace('%', '')) || 0;
            } else {
              value = (Number(value) || 0) * 100;
            }
            break;
            
          case 'date':
          case 'datetime':
            if (value instanceof Date) {
              value = value.toISOString();
            } else if (value) {
              const date = new Date(value);
              value = isNaN(date.getTime()) ? '' : date.toISOString();
            } else {
              value = '';
            }
            break;
            
          default:
            value = value ?? '';
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
   * Validate Excel data
   */
  static validateData(columns: DatabaseColumn[], rows: any[]): string[] {
    const errors: string[] = [];

    if (columns.length === 0) {
      errors.push('No columns found in Excel file');
    }

    if (rows.length === 0) {
      errors.push('No data rows found in Excel file');
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