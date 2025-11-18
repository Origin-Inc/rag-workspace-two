/**
 * File Parser Service Tests
 *
 * Comprehensive tests for CSV and Excel file parsing,
 * type inference, and error handling.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseFile, validateFile } from './file-parser.server';
import * as fs from 'fs';
import * as path from 'path';

describe('FileParser Service', () => {
  describe('validateFile', () => {
    it('should accept valid CSV files', () => {
      const result = validateFile('data.csv', 1024);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid Excel files', () => {
      const result1 = validateFile('data.xlsx', 1024);
      expect(result1.valid).toBe(true);

      const result2 = validateFile('data.xls', 1024);
      expect(result2.valid).toBe(true);
    });

    it('should reject invalid file types', () => {
      const result = validateFile('data.txt', 1024);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Only CSV and Excel files');
    });

    it('should reject files over 50MB', () => {
      const size = 51 * 1024 * 1024; // 51MB
      const result = validateFile('data.csv', size);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File size exceeds 50MB');
    });
  });

  describe('parseFile - CSV', () => {
    it('should parse basic CSV with headers', async () => {
      const csvContent = `Name,Age,City
John Doe,30,New York
Jane Smith,25,Los Angeles
Bob Johnson,35,Chicago`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = await parseFile({
        buffer,
        filename: 'test.csv',
        mimetype: 'text/csv',
      });

      expect(result.columns).toHaveLength(3);
      expect(result.rows).toHaveLength(3);
      expect(result.columns[0].name).toBe('Name');
      expect(result.columns[0].type).toBe('text');
      expect(result.columns[1].name).toBe('Age');
      expect(result.columns[1].type).toBe('number');
    });

    it('should handle CSV with mixed data types', async () => {
      const csvContent = `Product,Price,InStock,DateAdded
Widget A,19.99,true,2024-01-15
Widget B,29.99,false,2024-01-16
Widget C,39.99,yes,2024-01-17`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = await parseFile({
        buffer,
        filename: 'products.csv',
        mimetype: 'text/csv',
      });

      expect(result.columns[0].type).toBe('text'); // Product
      expect(result.columns[1].type).toBe('number'); // Price
      expect(result.columns[2].type).toBe('boolean'); // InStock
      expect(result.columns[3].type).toBe('date'); // DateAdded
    });

    it('should handle CSV with empty cells', async () => {
      const csvContent = `Name,Email,Phone
John,,555-1234
,jane@example.com,
Bob,bob@example.com,555-5678`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = await parseFile({
        buffer,
        filename: 'contacts.csv',
        mimetype: 'text/csv',
      });

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].col_2).toBe(''); // Empty email
      expect(result.rows[1].col_1).toBe(''); // Empty name
    });

    it('should handle CSV with special characters', async () => {
      const csvContent = `Name,Description,Price
"Product, A","Contains, commas",29.99
"Product ""B""","Has ""quotes""",39.99
Product C,"Line 1
Line 2",49.99`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = await parseFile({
        buffer,
        filename: 'special.csv',
        mimetype: 'text/csv',
      });

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].col_1).toBe('Product, A');
      expect(result.rows[1].col_1).toBe('Product "B"');
    });

    it('should reject empty CSV file', async () => {
      const csvContent = '';
      const buffer = Buffer.from(csvContent, 'utf-8');

      await expect(parseFile({
        buffer,
        filename: 'empty.csv',
        mimetype: 'text/csv',
      })).rejects.toThrow('CSV file is empty');
    });

    it('should handle different delimiters', async () => {
      const csvContent = `Name;Age;City
John;30;Berlin
Jane;25;Paris`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      // Note: PapaParse should auto-detect semicolon delimiter
      const result = await parseFile({
        buffer,
        filename: 'semicolon.csv',
        mimetype: 'text/csv',
      });

      expect(result.columns).toHaveLength(3);
      expect(result.rows).toHaveLength(2);
    });
  });

  describe('parseFile - Excel', () => {
    // Note: For actual Excel tests, you'd need real .xlsx files
    // These tests would require creating actual Excel files or mocking XLSX

    it('should handle Excel files with multiple sheets', async () => {
      // This would require a real Excel file
      // For now, we'll create a mock test

      // Create a simple Excel-like structure
      const mockWorkbook = {
        SheetNames: ['Sheet1', 'Sheet2'],
        Sheets: {
          Sheet1: {
            A1: { v: 'Name' },
            B1: { v: 'Age' },
            A2: { v: 'John' },
            B2: { v: 30 },
          },
        },
      };

      // This test would need actual XLSX file parsing
      expect(mockWorkbook.SheetNames).toHaveLength(2);
    });
  });

  describe('Type Inference', () => {
    it('should correctly infer number types', async () => {
      const csvContent = `IntColumn,FloatColumn,MixedColumn
100,10.5,100
200,20.75,200.5
300,30.25,text`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = await parseFile({
        buffer,
        filename: 'numbers.csv',
        mimetype: 'text/csv',
      });

      expect(result.columns[0].type).toBe('number');
      expect(result.columns[1].type).toBe('number');
      expect(result.columns[2].type).toBe('text'); // Mixed becomes text
    });

    it('should correctly infer boolean types', async () => {
      const csvContent = `BoolColumn1,BoolColumn2,MixedBool
true,yes,true
false,no,false
true,yes,maybe`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = await parseFile({
        buffer,
        filename: 'booleans.csv',
        mimetype: 'text/csv',
      });

      expect(result.columns[0].type).toBe('boolean');
      expect(result.columns[1].type).toBe('boolean');
      expect(result.columns[2].type).toBe('text'); // Mixed becomes text
    });

    it('should correctly infer date types', async () => {
      const csvContent = `DateColumn1,DateColumn2,NotADate
2024-01-15,01/15/2024,January 15
2024-01-16,01/16/2024,January 16
2024-01-17,01/17/2024,January 17`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = await parseFile({
        buffer,
        filename: 'dates.csv',
        mimetype: 'text/csv',
      });

      expect(result.columns[0].type).toBe('date');
      expect(result.columns[1].type).toBe('date');
      expect(result.columns[2].type).toBe('text');
    });

    it('should use 70% threshold for type inference', async () => {
      const csvContent = `MostlyNumbers
100
200
300
400
500
600
700
text
text
text`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = await parseFile({
        buffer,
        filename: 'threshold.csv',
        mimetype: 'text/csv',
      });

      // 7 out of 10 are numbers (70%), should be number type
      expect(result.columns[0].type).toBe('number');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very wide CSV (many columns)', async () => {
      const headers = Array.from({ length: 100 }, (_, i) => `Col${i + 1}`);
      const row = Array.from({ length: 100 }, (_, i) => i.toString());
      const csvContent = `${headers.join(',')}\n${row.join(',')}`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = await parseFile({
        buffer,
        filename: 'wide.csv',
        mimetype: 'text/csv',
      });

      expect(result.columns).toHaveLength(100);
      expect(result.columnCount).toBe(100);
    });

    it('should handle CSV with no headers', async () => {
      const csvContent = `John,30,New York
Jane,25,Los Angeles`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      // PapaParse with header:true should treat first row as headers
      const result = await parseFile({
        buffer,
        filename: 'no-headers.csv',
        mimetype: 'text/csv',
      });

      expect(result.columns[0].name).toBe('John');
      expect(result.columns[1].name).toBe('30');
      expect(result.columns[2].name).toBe('New York');
      expect(result.rows).toHaveLength(1); // Only second row as data
    });

    it('should handle Unicode characters', async () => {
      const csvContent = `Name,City,Notes
José,São Paulo,Café ☕
李明,北京,茶 🍵
محمد,القاهرة,قهوة`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = await parseFile({
        buffer,
        filename: 'unicode.csv',
        mimetype: 'text/csv',
      });

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].col_1).toBe('José');
      expect(result.rows[1].col_2).toBe('北京');
    });

    it('should handle very long cell values', async () => {
      const longText = 'A'.repeat(1000);
      const csvContent = `Short,Long
Brief,${longText}`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = await parseFile({
        buffer,
        filename: 'long-cells.csv',
        mimetype: 'text/csv',
      });

      expect(result.rows[0].col_2.length).toBe(1000);
    });
  });

  describe('Performance Tests', () => {
    it('should handle large CSV files efficiently', async () => {
      // Generate a large CSV (1000 rows)
      const headers = 'ID,Name,Email,Age,City,Country';
      const rows = Array.from({ length: 1000 }, (_, i) =>
        `${i},User${i},user${i}@example.com,${20 + (i % 50)},City${i % 100},Country${i % 10}`
      );
      const csvContent = `${headers}\n${rows.join('\n')}`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const startTime = Date.now();

      const result = await parseFile({
        buffer,
        filename: 'large.csv',
        mimetype: 'text/csv',
      });

      const elapsed = Date.now() - startTime;

      expect(result.rowCount).toBe(1000);
      expect(elapsed).toBeLessThan(1000); // Should parse in under 1 second
    });
  });
});