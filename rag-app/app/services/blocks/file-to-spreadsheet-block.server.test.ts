/**
 * File-to-SpreadsheetBlock Converter Service Tests
 *
 * Tests for converting parsed file data into SpreadsheetBlock format.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileToSpreadsheetBlockConverter } from './file-to-spreadsheet-block.server';
import type { ParsedFileData } from '../file-parser.server';
import type { Block } from '~/types/supabase';

// Mock the BlockService
vi.mock('../block.server', () => ({
  BlockService: vi.fn().mockImplementation(() => ({
    createBlock: vi.fn().mockImplementation((input) =>
      Promise.resolve({
        id: 'mock-block-id',
        ...input,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    ),
  })),
}));

describe('FileToSpreadsheetBlockConverter', () => {
  let converter: FileToSpreadsheetBlockConverter;

  beforeEach(() => {
    converter = new FileToSpreadsheetBlockConverter();
  });

  describe('convertToSpreadsheetBlock', () => {
    it('should convert parsed CSV data to SpreadsheetBlock', async () => {
      const parsedData: ParsedFileData = {
        columns: [
          { id: 'col_1', name: 'Product', type: 'text', width: 150 },
          { id: 'col_2', name: 'Price', type: 'number', width: 150 },
          { id: 'col_3', name: 'InStock', type: 'boolean', width: 150 },
        ],
        rows: [
          { id: 'row_1', col_1: 'Widget A', col_2: 29.99, col_3: true },
          { id: 'row_2', col_1: 'Widget B', col_2: 49.99, col_3: false },
        ],
        filename: 'test.csv',
        rowCount: 2,
        columnCount: 3,
      };

      const options = {
        pageId: 'test-page-id',
        userId: 'test-user-id',
        filename: 'products.csv',
        existingBlocks: [],
      };

      const result = await converter.convertToSpreadsheetBlock(parsedData, options);

      expect(result).toBeDefined();
      expect(result.pageId).toBe('test-page-id');
      expect(result.type).toBe('spreadsheet');
      expect(result.content).toHaveProperty('tableName');
      expect(result.content).toHaveProperty('title', 'products.csv');
      expect(result.content).toHaveProperty('columns');
      expect(result.content).toHaveProperty('rows');
      expect(result.content.columns).toHaveLength(3);
      expect(result.content.rows).toHaveLength(2);
    });

    it('should map column types correctly', async () => {
      const parsedData: ParsedFileData = {
        columns: [
          { id: 'col_1', name: 'Text', type: 'text', width: 150 },
          { id: 'col_2', name: 'Number', type: 'number', width: 150 },
          { id: 'col_3', name: 'Boolean', type: 'boolean', width: 150 },
          { id: 'col_4', name: 'Date', type: 'date', width: 150 },
        ],
        rows: [],
        filename: 'types.csv',
        rowCount: 0,
        columnCount: 4,
      };

      const options = {
        pageId: 'test-page-id',
        userId: 'test-user-id',
        existingBlocks: [],
      };

      const result = await converter.convertToSpreadsheetBlock(parsedData, options);

      const columns = result.content.columns;
      expect(columns[0].type).toBe('text');
      expect(columns[1].type).toBe('number');
      expect(columns[2].type).toBe('boolean');
      expect(columns[3].type).toBe('date');
    });

    it('should include metadata about the upload', async () => {
      const parsedData: ParsedFileData = {
        columns: [{ id: 'col_1', name: 'Test', type: 'text', width: 150 }],
        rows: [],
        filename: 'metadata-test.csv',
        rowCount: 10,
        columnCount: 5,
      };

      const options = {
        pageId: 'test-page-id',
        userId: 'test-user-id',
        existingBlocks: [],
      };

      const result = await converter.convertToSpreadsheetBlock(parsedData, options);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.source).toBe('file-upload');
      expect(result.metadata.originalFilename).toBe('metadata-test.csv');
      expect(result.metadata.rowCount).toBe(10);
      expect(result.metadata.columnCount).toBe(5);
      expect(result.metadata.uploadedAt).toBeDefined();
    });
  });

  describe('calculateNextPosition', () => {
    it('should position first block at origin', () => {
      const position = converter.calculateNextPosition([]);

      expect(position).toEqual({
        x: 0,
        y: 0,
        width: 12,
        height: 4,
      });
    });

    it('should stack blocks vertically', () => {
      const existingBlocks: Partial<Block>[] = [
        {
          id: 'block-1',
          position: { x: 0, y: 0, width: 12, height: 3 },
        },
      ];

      const position = converter.calculateNextPosition(existingBlocks as Block[]);

      expect(position).toEqual({
        x: 0,
        y: 3, // Below the first block
        width: 12,
        height: 4,
      });
    });

    it('should handle multiple existing blocks', () => {
      const existingBlocks: Partial<Block>[] = [
        {
          id: 'block-1',
          position: { x: 0, y: 0, width: 6, height: 2 },
        },
        {
          id: 'block-2',
          position: { x: 6, y: 0, width: 6, height: 3 },
        },
        {
          id: 'block-3',
          position: { x: 0, y: 2, width: 12, height: 4 },
        },
      ];

      const position = converter.calculateNextPosition(existingBlocks as Block[]);

      expect(position).toEqual({
        x: 0,
        y: 6, // Below block-3 which ends at y=6
        width: 12,
        height: 4,
      });
    });

    it('should handle blocks with missing position data', () => {
      const existingBlocks: Partial<Block>[] = [
        {
          id: 'block-1',
          // No position
        },
        {
          id: 'block-2',
          position: { x: 0, y: 5, width: 12, height: 2 },
        },
      ];

      const position = converter.calculateNextPosition(existingBlocks as Block[]);

      expect(position).toEqual({
        x: 0,
        y: 7, // Below block-2
        width: 12,
        height: 4,
      });
    });
  });

  describe('generateTableName', () => {
    it('should generate valid table names from filenames', () => {
      const converter = new FileToSpreadsheetBlockConverter();

      // Access private method through any type casting for testing
      const generateTableName = (converter as any).generateTableName.bind(converter);

      const name1 = generateTableName('My Data File.csv');
      expect(name1).toMatch(/^spreadsheet_my_data_file_[a-z0-9]+$/);

      const name2 = generateTableName('special-chars!@#$.xlsx');
      expect(name2).toMatch(/^spreadsheet_special_chars_[a-z0-9]+$/);

      const name3 = generateTableName('123numbers.csv');
      expect(name3).toMatch(/^spreadsheet_123numbers_[a-z0-9]+$/);

      const name4 = generateTableName('UPPERCASE.CSV');
      expect(name4).toMatch(/^spreadsheet_uppercase_[a-z0-9]+$/);
    });

    it('should ensure uniqueness with timestamp', async () => {
      const converter = new FileToSpreadsheetBlockConverter();
      const generateTableName = (converter as any).generateTableName.bind(converter);

      const name1 = generateTableName('same.csv');

      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 2));

      const name2 = generateTableName('same.csv');

      expect(name1).not.toBe(name2); // Different timestamps
      expect(name1).toMatch(/^spreadsheet_same_/);
      expect(name2).toMatch(/^spreadsheet_same_/);
    });
  });

  describe('createSkeletonBlock', () => {
    it('should create a placeholder block content', () => {
      const skeleton = converter.createSkeletonBlock('loading.csv');

      expect(skeleton).toBeDefined();
      expect(skeleton.title).toBe('loading.csv');
      expect(skeleton.tableName).toMatch(/^spreadsheet_loading_/);
      expect(skeleton.columns).toHaveLength(1);
      expect(skeleton.columns[0].name).toBe('Loading...');
      expect(skeleton.rows).toHaveLength(0);
    });
  });

  describe('validateParsedData', () => {
    it('should accept valid parsed data', () => {
      const parsedData: ParsedFileData = {
        columns: [
          { id: 'col_1', name: 'Test', type: 'text', width: 150 },
        ],
        rows: [
          { id: 'row_1', col_1: 'Value' },
        ],
        filename: 'valid.csv',
        rowCount: 1,
        columnCount: 1,
      };

      const result = converter.validateParsedData(parsedData);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject data with no columns', () => {
      const parsedData: ParsedFileData = {
        columns: [],
        rows: [],
        filename: 'empty.csv',
        rowCount: 0,
        columnCount: 0,
      };

      const result = converter.validateParsedData(parsedData);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least one column');
    });

    it('should reject data with too many columns', () => {
      const columns = Array.from({ length: 101 }, (_, i) => ({
        id: `col_${i + 1}`,
        name: `Column ${i + 1}`,
        type: 'text' as const,
        width: 150,
      }));

      const parsedData: ParsedFileData = {
        columns,
        rows: [],
        filename: 'wide.csv',
        rowCount: 0,
        columnCount: 101,
      };

      const result = converter.validateParsedData(parsedData);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too many columns');
    });

    it('should reject data with too many rows', () => {
      const rows = Array.from({ length: 10001 }, (_, i) => ({
        id: `row_${i + 1}`,
        col_1: `Value ${i + 1}`,
      }));

      const parsedData: ParsedFileData = {
        columns: [
          { id: 'col_1', name: 'Test', type: 'text', width: 150 },
        ],
        rows,
        filename: 'large.csv',
        rowCount: 10001,
        columnCount: 1,
      };

      const result = converter.validateParsedData(parsedData);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too many rows');
    });
  });

  describe('convertMultipleToSpreadsheetBlocks', () => {
    it('should convert multiple files and position them correctly', async () => {
      const parsedFiles: ParsedFileData[] = [
        {
          columns: [{ id: 'col_1', name: 'A', type: 'text', width: 150 }],
          rows: [{ id: 'row_1', col_1: 'Value A' }],
          filename: 'file1.csv',
          rowCount: 1,
          columnCount: 1,
        },
        {
          columns: [{ id: 'col_1', name: 'B', type: 'number', width: 150 }],
          rows: [{ id: 'row_1', col_1: 100 }],
          filename: 'file2.csv',
          rowCount: 1,
          columnCount: 1,
        },
      ];

      const options = {
        pageId: 'test-page-id',
        userId: 'test-user-id',
        existingBlocks: [],
      };

      const results = await converter.convertMultipleToSpreadsheetBlocks(
        parsedFiles,
        options
      );

      expect(results).toHaveLength(2);
      expect(results[0].content.title).toBe('file1.csv');
      expect(results[1].content.title).toBe('file2.csv');

      // Check that blocks are positioned sequentially
      expect(results[0].position.y).toBe(0);
      expect(results[1].position.y).toBe(4); // Below the first block
    });
  });
});