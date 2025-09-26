import { describe, it, expect, beforeEach } from 'vitest';
import { FuzzyFileMatcherClient } from './fuzzy-file-matcher.client';
import type { DataFile } from '~/stores/chat-store';

describe('FuzzyFileMatcherClient', () => {
  let mockFiles: DataFile[];
  
  beforeEach(() => {
    const now = Date.now();
    mockFiles = [
      {
        id: '1',
        filename: 'sales_data_2024.csv',
        tableName: 'sales_data_2024',
        uploadedAt: new Date(now - 1000).toISOString(), // Most recent
        schema: [
          { name: 'product', type: 'string' },
          { name: 'amount', type: 'number' }
        ],
        rowCount: 100,
        sizeBytes: 5000,
        status: 'ready'
      },
      {
        id: '2',
        filename: 'customer_info.xlsx',
        tableName: 'customer_info',
        uploadedAt: new Date(now - 10000).toISOString(), // Older
        schema: [
          { name: 'name', type: 'string' },
          { name: 'email', type: 'string' }
        ],
        rowCount: 50,
        sizeBytes: 3000,
        status: 'ready'
      }
    ];
  });

  describe('Demonstrative References', () => {
    it('should match "this file" to the most recent file', () => {
      const results = FuzzyFileMatcherClient.matchFiles('summarize this file', mockFiles);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].file.filename).toBe('sales_data_2024.csv');
      expect(results[0].confidence).toBeGreaterThan(0.9);
      expect(results[0].matchType).toBe('temporal');
    });

    it('should match "the file" to the only file when there is one', () => {
      const singleFile = [mockFiles[0]];
      const results = FuzzyFileMatcherClient.matchFiles('analyze the file', singleFile);
      
      expect(results.length).toBe(1);
      expect(results[0].file.filename).toBe('sales_data_2024.csv');
      expect(results[0].confidence).toBe(1.0);
      expect(results[0].reason).toContain('Only file available');
    });

    it('should handle "that file" reference', () => {
      const results = FuzzyFileMatcherClient.matchFiles('what is in that file', mockFiles);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].file.filename).toBe('sales_data_2024.csv');
      expect(results[0].confidence).toBeGreaterThan(0.9);
    });

    it('should handle implicit references like "summarize this"', () => {
      const results = FuzzyFileMatcherClient.matchFiles('summarize this', mockFiles);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].file.filename).toBe('sales_data_2024.csv');
      expect(results[0].confidence).toBeGreaterThan(0.9);
    });

    it('should handle "analyze it" reference', () => {
      const results = FuzzyFileMatcherClient.matchFiles('analyze it', mockFiles);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].file.filename).toBe('sales_data_2024.csv');
    });

    it('should handle "what does this contain" queries', () => {
      const results = FuzzyFileMatcherClient.matchFiles('what does this contain', mockFiles);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].confidence).toBeGreaterThan(0.8);
    });

    it('should provide alternative suggestions for demonstrative references', () => {
      const results = FuzzyFileMatcherClient.matchFiles('this file', mockFiles);
      
      // Should have both files, with recent one first
      expect(results.length).toBe(2);
      expect(results[0].file.filename).toBe('sales_data_2024.csv');
      expect(results[0].confidence).toBeGreaterThan(0.9);
      expect(results[1].file.filename).toBe('customer_info.xlsx');
      expect(results[1].confidence).toBeLessThan(0.5);
    });
  });

  describe('Partial Filename Matching', () => {
    it('should match partial filename "sales" to sales_data_2024.csv', () => {
      const results = FuzzyFileMatcherClient.matchFiles('analyze sales', mockFiles);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].file.filename).toBe('sales_data_2024.csv');
      expect(results[0].confidence).toBeGreaterThan(0.4);
    });

    it('should match partial filename "customer" to customer_info.xlsx', () => {
      const results = FuzzyFileMatcherClient.matchFiles('show customer', mockFiles);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].file.filename).toBe('customer_info.xlsx');
      expect(results[0].confidence).toBeGreaterThan(0.4);
    });

    it('should be case-insensitive', () => {
      const results = FuzzyFileMatcherClient.matchFiles('SALES data', mockFiles);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].file.filename).toBe('sales_data_2024.csv');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file list gracefully', () => {
      const results = FuzzyFileMatcherClient.matchFiles('this file', []);
      
      expect(results).toEqual([]);
    });

    it('should handle queries with no file reference', () => {
      const results = FuzzyFileMatcherClient.matchFiles('hello world', mockFiles);
      
      // Should not match demonstrative reference
      expect(results.every(r => r.matchType !== 'temporal' || r.reason !== 'Most recently uploaded file')).toBe(true);
    });

    it('should distinguish between demonstrative and specific references', () => {
      // Add a file named "this_report.csv"
      const filesWithThisName = [
        ...mockFiles,
        {
          id: '3',
          filename: 'this_report.csv',
          tableName: 'this_report',
          uploadedAt: new Date(Date.now() - 5000).toISOString(),
          schema: [],
          rowCount: 10,
          sizeBytes: 1000,
          status: 'ready' as const
        }
      ];
      
      // Should match the specific file, not treat as demonstrative
      const results = FuzzyFileMatcherClient.matchFiles('analyze this_report', filesWithThisName);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].file.filename).toBe('this_report.csv');
      // Should not be temporal match type since it's a specific name match
      expect(results[0].matchType).not.toBe('temporal');
    });
  });

  describe('Simple Commands', () => {
    it('should recognize "summarize" as implicit file reference', () => {
      const results = FuzzyFileMatcherClient.matchFiles('summarize', mockFiles);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].file.filename).toBe('sales_data_2024.csv');
      expect(results[0].matchType).toBe('temporal');
    });

    it('should recognize "analyze" as implicit file reference', () => {
      const results = FuzzyFileMatcherClient.matchFiles('analyze', mockFiles);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].file.filename).toBe('sales_data_2024.csv');
    });
  });
});