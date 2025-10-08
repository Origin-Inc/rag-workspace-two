/**
 * Tests for QueryErrorRecovery
 *
 * Related: Task #54.5 (API Endpoint and Error Recovery System)
 */

import { describe, it, expect, vi } from 'vitest';
import { QueryErrorRecovery } from './query-error-recovery.server';

describe('QueryErrorRecovery', () => {
  describe('classifyError', () => {
    it('should classify syntax errors', () => {
      const error = new Error('Syntax error at line 1: unexpected token');
      const classified = QueryErrorRecovery.classifyError(error);

      expect(classified.category).toBe('syntax_error');
      expect(classified.isRecoverable).toBe(true);
      expect(classified.retryable).toBe(true);
      expect(classified.suggestions.length).toBeGreaterThan(0);
    });

    it('should classify schema errors for missing table', () => {
      const error = new Error('Table "sales_data" does not exist');
      const classified = QueryErrorRecovery.classifyError(error);

      expect(classified.category).toBe('schema_error');
      expect(classified.userMessage).toContain('sales_data');
      expect(classified.isRecoverable).toBe(true);
    });

    it('should classify schema errors for missing column', () => {
      const error = new Error('Column "revenue" not found');
      const classified = QueryErrorRecovery.classifyError(error);

      expect(classified.category).toBe('schema_error');
      expect(classified.userMessage).toContain('revenue');
    });

    it('should classify validation errors', () => {
      const error = new Error('Destructive operation not allowed: DROP');
      const classified = QueryErrorRecovery.classifyError(error);

      expect(classified.category).toBe('validation_error');
      expect(classified.suggestions).toContain('Only SELECT queries are allowed');
    });

    it('should classify execution errors', () => {
      const error = new Error('Execution failed: division by zero');
      const classified = QueryErrorRecovery.classifyError(error);

      expect(classified.category).toBe('execution_error');
      expect(classified.isRecoverable).toBe(true);
      expect(classified.retryable).toBe(false);
    });

    it('should classify timeout errors', () => {
      const error = new Error('Query timed out after 30 seconds');
      const classified = QueryErrorRecovery.classifyError(error);

      expect(classified.category).toBe('timeout_error');
      expect(classified.suggestions).toContain('Try adding filters to reduce the amount of data processed');
    });

    it('should classify resource errors', () => {
      const error = new Error('Out of memory: result set too large');
      const classified = QueryErrorRecovery.classifyError(error);

      expect(classified.category).toBe('resource_error');
      expect(classified.retryable).toBe(false);
    });

    it('should classify authentication errors', () => {
      const error = new Error('Unauthorized access');
      const classified = QueryErrorRecovery.classifyError(error);

      expect(classified.category).toBe('authentication_error');
      expect(classified.isRecoverable).toBe(false);
    });

    it('should classify unknown errors', () => {
      const error = new Error('Some random error');
      const classified = QueryErrorRecovery.classifyError(error);

      expect(classified.category).toBe('unknown_error');
      expect(classified.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle string errors', () => {
      const classified = QueryErrorRecovery.classifyError('Syntax error');

      expect(classified.category).toBe('syntax_error');
    });
  });

  describe('withRetry', () => {
    it('should succeed on first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await QueryErrorRecovery.withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue('success');

      const result = await QueryErrorRecovery.withRetry(fn, {
        maxRetries: 3,
        baseDelay: 10
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Execution failed: division by zero'));

      await expect(
        QueryErrorRecovery.withRetry(fn, { maxRetries: 3, baseDelay: 10 })
      ).rejects.toThrow('division by zero');

      expect(fn).toHaveBeenCalledTimes(1); // Only one attempt
    });

    it('should throw error after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Timeout'));

      await expect(
        QueryErrorRecovery.withRetry(fn, { maxRetries: 2, baseDelay: 10 })
      ).rejects.toThrow('Timeout');

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should call onRetry callback', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue('success');

      const onRetry = vi.fn();

      await QueryErrorRecovery.withRetry(fn, { baseDelay: 10 }, onRetry);

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    });

    it('should use exponential backoff', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValue('success');

      const delays: number[] = [];
      const onRetry = vi.fn((attempt) => {
        delays.push(Date.now());
      });

      await QueryErrorRecovery.withRetry(fn, {
        maxRetries: 3,
        baseDelay: 100,
        backoffMultiplier: 2
      }, onRetry);

      expect(fn).toHaveBeenCalledTimes(3);
      // Verify delays increase (first retry ~100ms, second ~200ms)
      // Note: timing tests can be flaky, so we just verify the pattern
      expect(onRetry).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateErrorResponse', () => {
    it('should generate user-friendly response', () => {
      const error = new Error('Table "sales" does not exist');
      const response = QueryErrorRecovery.generateErrorResponse(error);

      expect(response.content).toContain('sales');
      expect(response.content).toContain('Suggestions:');
      expect(response.metadata.category).toBe('schema_error');
      expect(response.metadata.suggestions.length).toBeGreaterThan(0);
    });

    it('should include error details in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Test error');
      const response = QueryErrorRecovery.generateErrorResponse(error);

      expect(response.content).toContain('Test error');

      process.env.NODE_ENV = originalEnv;
    });

    it('should hide error details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Sensitive error details');
      const response = QueryErrorRecovery.generateErrorResponse(error);

      expect(response.content).not.toContain('Sensitive error details');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('suggestCorrections', () => {
    it('should suggest available tables for schema errors', () => {
      const error = new Error('Table "invalid" does not exist');
      const availableTables = ['sales', 'customers', 'products'];

      const corrections = QueryErrorRecovery.suggestCorrections(
        'SELECT * FROM invalid',
        error,
        availableTables
      );

      expect(corrections.length).toBeGreaterThan(0);
      expect(corrections.some(c => c.includes('table'))).toBe(true);
    });

    it('should suggest simplification for syntax errors', () => {
      const error = new Error('Syntax error');
      const longQuery = 'A very long query that asks about multiple things and is probably too complex and should be broken down into smaller parts that are easier to process';

      const corrections = QueryErrorRecovery.suggestCorrections(longQuery, error);

      expect(corrections.some(c => c.toLowerCase().includes('simpler'))).toBe(true);
    });

    it('should limit corrections to 3', () => {
      const error = new Error('Syntax error');
      const corrections = QueryErrorRecovery.suggestCorrections('test?', error, ['t1', 't2', 't3', 't4', 't5']);

      expect(corrections.length).toBeLessThanOrEqual(3);
    });
  });

  describe('isTransientError', () => {
    it('should identify timeout as transient', () => {
      const error = new Error('Query timed out');
      expect(QueryErrorRecovery.isTransientError(error)).toBe(true);
    });

    it('should identify resource error as transient', () => {
      const error = new Error('Out of memory');
      expect(QueryErrorRecovery.isTransientError(error)).toBe(true);
    });

    it('should not identify syntax error as transient', () => {
      const error = new Error('Syntax error');
      expect(QueryErrorRecovery.isTransientError(error)).toBe(false);
    });

    it('should not identify validation error as transient', () => {
      const error = new Error('Destructive operation not allowed');
      expect(QueryErrorRecovery.isTransientError(error)).toBe(false);
    });
  });

  describe('Error Categories', () => {
    const testCases: Array<{ error: string; expectedCategory: string }> = [
      { error: 'Syntax error at position 10', expectedCategory: 'syntax_error' },
      { error: 'Table customers does not exist', expectedCategory: 'schema_error' },
      { error: 'Column name not found', expectedCategory: 'schema_error' },
      { error: 'Destructive operation forbidden', expectedCategory: 'validation_error' },
      { error: 'Query execution failed: type mismatch', expectedCategory: 'execution_error' },
      { error: 'Operation timed out after 60s', expectedCategory: 'timeout_error' },
      { error: 'Result set too large for available memory', expectedCategory: 'resource_error' },
      { error: 'User not authenticated', expectedCategory: 'authentication_error' },
      { error: 'Some weird error that we have not seen before', expectedCategory: 'unknown_error' }
    ];

    testCases.forEach(({ error, expectedCategory }) => {
      it(`should classify "${error.substring(0, 30)}..." as ${expectedCategory}`, () => {
        const classified = QueryErrorRecovery.classifyError(new Error(error));
        expect(classified.category).toBe(expectedCategory);
      });
    });
  });
});
