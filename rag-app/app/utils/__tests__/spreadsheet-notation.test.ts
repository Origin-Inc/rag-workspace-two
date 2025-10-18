/**
 * Spreadsheet Notation Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  columnIndexToA1,
  a1ToColumnIndex,
  indicesToA1,
  parseA1,
  columnIdToA1,
  a1ToColumnId,
  isValidA1,
  getA1Range,
  parseA1Range,
  getColumnLetter,
  extractA1References,
} from '../spreadsheet-notation';

describe('Spreadsheet Notation Utilities', () => {
  describe('columnIndexToA1', () => {
    it('should convert single letter columns', () => {
      expect(columnIndexToA1(0)).toBe('A');
      expect(columnIndexToA1(1)).toBe('B');
      expect(columnIndexToA1(25)).toBe('Z');
    });

    it('should convert double letter columns', () => {
      expect(columnIndexToA1(26)).toBe('AA');
      expect(columnIndexToA1(27)).toBe('AB');
      expect(columnIndexToA1(51)).toBe('AZ');
      expect(columnIndexToA1(52)).toBe('BA');
    });

    it('should convert triple letter columns', () => {
      expect(columnIndexToA1(702)).toBe('AAA');
      expect(columnIndexToA1(703)).toBe('AAB');
    });

    it('should handle edge cases', () => {
      expect(columnIndexToA1(675)).toBe('YZ');
      expect(columnIndexToA1(676)).toBe('ZA');
      expect(columnIndexToA1(701)).toBe('ZZ');
    });
  });

  describe('a1ToColumnIndex', () => {
    it('should convert single letter columns', () => {
      expect(a1ToColumnIndex('A')).toBe(0);
      expect(a1ToColumnIndex('B')).toBe(1);
      expect(a1ToColumnIndex('Z')).toBe(25);
    });

    it('should convert double letter columns', () => {
      expect(a1ToColumnIndex('AA')).toBe(26);
      expect(a1ToColumnIndex('AB')).toBe(27);
      expect(a1ToColumnIndex('AZ')).toBe(51);
      expect(a1ToColumnIndex('BA')).toBe(52);
    });

    it('should convert triple letter columns', () => {
      expect(a1ToColumnIndex('AAA')).toBe(702);
      expect(a1ToColumnIndex('AAB')).toBe(703);
    });

    it('should be case insensitive', () => {
      expect(a1ToColumnIndex('a')).toBe(0);
      expect(a1ToColumnIndex('aa')).toBe(26);
      expect(a1ToColumnIndex('Aa')).toBe(26);
    });

    it('should handle edge cases', () => {
      expect(a1ToColumnIndex('YZ')).toBe(675);
      expect(a1ToColumnIndex('ZA')).toBe(676);
      expect(a1ToColumnIndex('ZZ')).toBe(701);
    });
  });

  describe('Round-trip conversions', () => {
    it('should convert index to A1 and back', () => {
      for (let i = 0; i < 1000; i++) {
        const a1 = columnIndexToA1(i);
        const index = a1ToColumnIndex(a1);
        expect(index).toBe(i);
      }
    });

    it('should convert A1 to index and back', () => {
      const testCases = ['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA', 'ZZZ'];
      testCases.forEach((a1) => {
        const index = a1ToColumnIndex(a1);
        const converted = columnIndexToA1(index);
        expect(converted).toBe(a1);
      });
    });
  });

  describe('indicesToA1', () => {
    it('should convert indices to A1 notation', () => {
      expect(indicesToA1(0, 0)).toBe('A1');
      expect(indicesToA1(0, 1)).toBe('B1');
      expect(indicesToA1(1, 0)).toBe('A2');
      expect(indicesToA1(9, 2)).toBe('C10');
    });

    it('should handle large indices', () => {
      expect(indicesToA1(99, 26)).toBe('AA100');
      expect(indicesToA1(999, 701)).toBe('ZZ1000');
    });
  });

  describe('parseA1', () => {
    it('should parse simple A1 notation', () => {
      expect(parseA1('A1')).toEqual({ row: 0, col: 0 });
      expect(parseA1('B1')).toEqual({ row: 0, col: 1 });
      expect(parseA1('A2')).toEqual({ row: 1, col: 0 });
      expect(parseA1('C10')).toEqual({ row: 9, col: 2 });
    });

    it('should parse complex A1 notation', () => {
      expect(parseA1('AA100')).toEqual({ row: 99, col: 26 });
      expect(parseA1('ZZ1000')).toEqual({ row: 999, col: 701 });
    });

    it('should be case insensitive', () => {
      expect(parseA1('a1')).toEqual({ row: 0, col: 0 });
      expect(parseA1('aA100')).toEqual({ row: 99, col: 26 });
    });

    it('should return null for invalid notation', () => {
      expect(parseA1('1A')).toBeNull();
      expect(parseA1('A')).toBeNull();
      expect(parseA1('1')).toBeNull();
      expect(parseA1('AAA')).toBeNull();
      expect(parseA1('')).toBeNull();
    });
  });

  describe('Round-trip A1 conversions', () => {
    it('should convert indices to A1 and back', () => {
      const testCases = [
        [0, 0],
        [1, 1],
        [9, 25],
        [99, 26],
        [999, 701],
      ];

      testCases.forEach(([row, col]) => {
        const a1 = indicesToA1(row, col);
        const parsed = parseA1(a1);
        expect(parsed).toEqual({ row, col });
      });
    });
  });

  describe('columnIdToA1', () => {
    it('should convert column IDs to A1', () => {
      expect(columnIdToA1('col_1')).toBe('A');
      expect(columnIdToA1('col_2')).toBe('B');
      expect(columnIdToA1('col_26')).toBe('Z');
      expect(columnIdToA1('col_27')).toBe('AA');
    });

    it('should handle invalid column IDs', () => {
      expect(columnIdToA1('invalid')).toBe('invalid');
      expect(columnIdToA1('column_1')).toBe('column_1');
    });
  });

  describe('a1ToColumnId', () => {
    it('should convert A1 to column IDs', () => {
      expect(a1ToColumnId('A')).toBe('col_1');
      expect(a1ToColumnId('B')).toBe('col_2');
      expect(a1ToColumnId('Z')).toBe('col_26');
      expect(a1ToColumnId('AA')).toBe('col_27');
    });

    it('should be case insensitive', () => {
      expect(a1ToColumnId('a')).toBe('col_1');
      expect(a1ToColumnId('aa')).toBe('col_27');
    });
  });

  describe('Round-trip column ID conversions', () => {
    it('should convert column ID to A1 and back', () => {
      for (let i = 1; i <= 100; i++) {
        const colId = `col_${i}`;
        const a1 = columnIdToA1(colId);
        const converted = a1ToColumnId(a1);
        expect(converted).toBe(colId);
      }
    });
  });

  describe('isValidA1', () => {
    it('should validate correct A1 notation', () => {
      expect(isValidA1('A1')).toBe(true);
      expect(isValidA1('Z99')).toBe(true);
      expect(isValidA1('AA100')).toBe(true);
      expect(isValidA1('ZZZ9999')).toBe(true);
    });

    it('should reject invalid notation', () => {
      expect(isValidA1('1A')).toBe(false);
      expect(isValidA1('A')).toBe(false);
      expect(isValidA1('1')).toBe(false);
      expect(isValidA1('A1B')).toBe(false);
      expect(isValidA1('')).toBe(false);
      expect(isValidA1('A-1')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isValidA1('a1')).toBe(true);
      expect(isValidA1('Aa100')).toBe(true);
    });
  });

  describe('getA1Range', () => {
    it('should create A1 range notation', () => {
      expect(getA1Range(0, 0, 0, 0)).toBe('A1:A1');
      expect(getA1Range(0, 0, 9, 2)).toBe('A1:C10');
      expect(getA1Range(0, 0, 99, 25)).toBe('A1:Z100');
    });

    it('should handle multi-letter columns', () => {
      expect(getA1Range(0, 26, 9, 51)).toBe('AA1:AZ10');
    });
  });

  describe('parseA1Range', () => {
    it('should parse simple ranges', () => {
      expect(parseA1Range('A1:A1')).toEqual({
        start: { row: 0, col: 0 },
        end: { row: 0, col: 0 },
      });

      expect(parseA1Range('A1:C10')).toEqual({
        start: { row: 0, col: 0 },
        end: { row: 9, col: 2 },
      });
    });

    it('should parse complex ranges', () => {
      expect(parseA1Range('AA1:AZ10')).toEqual({
        start: { row: 0, col: 26 },
        end: { row: 9, col: 51 },
      });
    });

    it('should return null for invalid ranges', () => {
      expect(parseA1Range('A1')).toBeNull();
      expect(parseA1Range('A1:')).toBeNull();
      expect(parseA1Range(':A1')).toBeNull();
      expect(parseA1Range('1A:2B')).toBeNull();
    });
  });

  describe('Round-trip range conversions', () => {
    it('should convert range to A1 and back', () => {
      const testCases = [
        [0, 0, 0, 0],
        [0, 0, 9, 2],
        [5, 10, 15, 20],
        [0, 26, 99, 51],
      ];

      testCases.forEach(([startRow, startCol, endRow, endCol]) => {
        const range = getA1Range(startRow, startCol, endRow, endCol);
        const parsed = parseA1Range(range);
        expect(parsed).toEqual({
          start: { row: startRow, col: startCol },
          end: { row: endRow, col: endCol },
        });
      });
    });
  });

  describe('getColumnLetter', () => {
    it('should return column letters', () => {
      expect(getColumnLetter(0)).toBe('A');
      expect(getColumnLetter(25)).toBe('Z');
      expect(getColumnLetter(26)).toBe('AA');
    });
  });

  describe('extractA1References', () => {
    it('should extract single cell references', () => {
      const refs = extractA1References('=A1+B2');
      expect(refs).toContain('A1');
      expect(refs).toContain('B2');
    });

    it('should extract range references', () => {
      const refs = extractA1References('=SUM(A1:A10)');
      expect(refs).toContain('A1:A10');
    });

    it('should extract mixed references', () => {
      const refs = extractA1References('=SUM(A1:A10)+B5*C3');
      expect(refs.length).toBeGreaterThan(0);
      expect(refs).toContain('A1:A10');
      expect(refs).toContain('B5');
      expect(refs).toContain('C3');
    });

    it('should handle complex formulas', () => {
      const refs = extractA1References('=IF(A1>10, SUM(B1:B10), AVERAGE(C1:C10))');
      expect(refs).toContain('A1');
      expect(refs).toContain('B1:B10');
      expect(refs).toContain('C1:C10');
    });

    it('should remove duplicates', () => {
      const refs = extractA1References('=A1+A1+A1');
      expect(refs).toEqual(['A1']);
    });

    it('should return empty array for formulas without references', () => {
      const refs = extractA1References('=5+3');
      expect(refs).toEqual([]);
    });

    it('should handle multi-letter columns', () => {
      const refs = extractA1References('=AA1+AB2');
      expect(refs).toContain('AA1');
      expect(refs).toContain('AB2');
    });
  });

  describe('Performance', () => {
    it('should handle large column indices efficiently', () => {
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        columnIndexToA1(i);
      }
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should parse A1 notation efficiently', () => {
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        parseA1('ZZ9999');
      }
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});
