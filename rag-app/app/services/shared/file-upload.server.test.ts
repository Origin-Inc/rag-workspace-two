/**
 * Tests for FileUploadService
 *
 * Related: ADR-002 (Shared Services Layer), Task #65
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileUploadService } from './file-upload.server';

describe('FileUploadService', () => {
  describe('validateFile', () => {
    it('should accept valid CSV files', () => {
      const file = new File(['test,data'], 'test.csv', { type: 'text/csv' });
      const result = FileUploadService.validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid Excel files (.xlsx)', () => {
      const file = new File(['test'], 'test.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const result = FileUploadService.validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid Excel files (.xls)', () => {
      const file = new File(['test'], 'test.xls', {
        type: 'application/vnd.ms-excel'
      });
      const result = FileUploadService.validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject files larger than 50MB', () => {
      const largeData = new Uint8Array(51 * 1024 * 1024); // 51MB
      const file = new File([largeData], 'large.csv', { type: 'text/csv' });
      const result = FileUploadService.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
      expect(result.error).toContain('50MB');
    });

    it('should reject empty files', () => {
      const file = new File([], 'empty.csv', { type: 'text/csv' });
      const result = FileUploadService.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject unsupported file types', () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const result = FileUploadService.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not supported');
      expect(result.error).toContain('CSV or Excel');
    });

    it('should reject files with invalid MIME types', () => {
      const file = new File(['test'], 'test.csv', { type: 'application/pdf' });
      const result = FileUploadService.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid MIME type');
    });

    it('should handle files with uppercase extensions', () => {
      const file = new File(['test,data'], 'TEST.CSV', { type: 'text/csv' });
      const result = FileUploadService.validateFile(file);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateFiles', () => {
    it('should validate multiple files', () => {
      const files = [
        new File(['test'], 'valid.csv', { type: 'text/csv' }),
        new File(['test'], 'invalid.txt', { type: 'text/plain' }),
        new File(['test'], 'also-valid.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }),
      ];

      const results = FileUploadService.validateFiles(files);

      expect(results).toHaveLength(3);
      expect(results[0].validation.valid).toBe(true);
      expect(results[1].validation.valid).toBe(false);
      expect(results[2].validation.valid).toBe(true);
    });
  });

  describe('getAllowedTypes', () => {
    it('should return comma-separated list of allowed extensions', () => {
      const allowed = FileUploadService.getAllowedTypes();

      expect(allowed).toBe('.csv,.xlsx,.xls');
    });
  });

  describe('hasAllowedExtension', () => {
    it('should return true for CSV files', () => {
      expect(FileUploadService.hasAllowedExtension('data.csv')).toBe(true);
      expect(FileUploadService.hasAllowedExtension('DATA.CSV')).toBe(true);
      expect(FileUploadService.hasAllowedExtension('my-file.csv')).toBe(true);
    });

    it('should return true for Excel files', () => {
      expect(FileUploadService.hasAllowedExtension('data.xlsx')).toBe(true);
      expect(FileUploadService.hasAllowedExtension('data.xls')).toBe(true);
      expect(FileUploadService.hasAllowedExtension('DATA.XLSX')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      expect(FileUploadService.hasAllowedExtension('data.txt')).toBe(false);
      expect(FileUploadService.hasAllowedExtension('data.pdf')).toBe(false);
      expect(FileUploadService.hasAllowedExtension('data.json')).toBe(false);
      expect(FileUploadService.hasAllowedExtension('data.xml')).toBe(false);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(FileUploadService.formatFileSize(100)).toBe('100 bytes');
      expect(FileUploadService.formatFileSize(500)).toBe('500 bytes');
    });

    it('should format kilobytes correctly', () => {
      expect(FileUploadService.formatFileSize(1024)).toBe('1.0 KB');
      expect(FileUploadService.formatFileSize(1536)).toBe('1.5 KB');
      expect(FileUploadService.formatFileSize(10240)).toBe('10.0 KB');
    });

    it('should format megabytes correctly', () => {
      expect(FileUploadService.formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(FileUploadService.formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
      expect(FileUploadService.formatFileSize(50 * 1024 * 1024)).toBe('50.0 MB');
    });
  });

  describe('getMaxFileSize', () => {
    it('should return 50MB in bytes', () => {
      const maxSize = FileUploadService.getMaxFileSize();

      expect(maxSize).toBe(50 * 1024 * 1024);
    });
  });

  describe('getMaxFileSizeFormatted', () => {
    it('should return formatted max file size', () => {
      const formatted = FileUploadService.getMaxFileSizeFormatted();

      expect(formatted).toBe('50.0 MB');
    });
  });

  // Integration tests for upload() method would require mocking:
  // - FileProcessingService
  // - FileStorageService
  // - DuckDBSerializationService
  // - Prisma client
  //
  // These should be tested in integration/E2E tests
});
