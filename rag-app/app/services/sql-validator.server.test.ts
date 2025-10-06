/**
 * Tests for SQLValidator
 *
 * Related: Task #54.3 (SQL Generation and Validation Layer)
 */

import { describe, it, expect } from 'vitest';
import { SQLValidator } from './sql-validator.server';

describe('SQLValidator', () => {
  const testSchema = [
    {
      tableName: 'sales',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'product', type: 'text' },
        { name: 'amount', type: 'number' },
        { name: 'date', type: 'date' }
      ]
    },
    {
      tableName: 'customers',
      columns: [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'text' },
        { name: 'email', type: 'text' }
      ]
    }
  ];

  describe('validate', () => {
    it('should accept valid SELECT query', () => {
      const sql = 'SELECT * FROM sales LIMIT 10';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty SQL', () => {
      const result = SQLValidator.validate('', testSchema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SQL query is empty');
    });

    it('should reject non-SELECT queries', () => {
      const sql = 'INSERT INTO sales VALUES (1, "Widget", 100)';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Query must be a SELECT statement');
    });
  });

  describe('checkDestructiveOperations', () => {
    it('should reject DROP TABLE', () => {
      const sql = 'DROP TABLE sales';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('DROP'))).toBe(true);
    });

    it('should reject DELETE FROM', () => {
      const sql = 'DELETE FROM sales WHERE id = 1';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('DELETE'))).toBe(true);
    });

    it('should reject UPDATE', () => {
      const sql = 'UPDATE sales SET amount = 200 WHERE id = 1';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('UPDATE'))).toBe(true);
    });

    it('should reject ALTER TABLE', () => {
      const sql = 'ALTER TABLE sales ADD COLUMN new_col TEXT';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('ALTER'))).toBe(true);
    });

    it('should reject CREATE TABLE', () => {
      const sql = 'CREATE TABLE new_table (id INT, name TEXT)';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('CREATE'))).toBe(true);
    });

    it('should reject TRUNCATE', () => {
      const sql = 'TRUNCATE TABLE sales';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('TRUNCATE'))).toBe(true);
    });
  });

  describe('checkSQLInjection', () => {
    it('should detect multiple statements', () => {
      const sql = 'SELECT * FROM sales; DROP TABLE sales';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Multiple statements'))).toBe(true);
    });

    it('should warn about SQL comments', () => {
      const sql = 'SELECT * FROM sales -- comment';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.warnings.some(w => w.includes('comment'))).toBe(true);
    });

    it('should warn about block comments', () => {
      const sql = 'SELECT * FROM sales /* comment */';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.warnings.some(w => w.includes('comment'))).toBe(true);
    });

    it('should detect tautology OR 1=1', () => {
      const sql = 'SELECT * FROM sales WHERE id = 1 OR 1=1';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Tautology'))).toBe(true);
    });

    it('should warn about UNION SELECT', () => {
      const sql = 'SELECT * FROM sales UNION SELECT * FROM customers';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.warnings.some(w => w.includes('UNION SELECT'))).toBe(true);
    });
  });

  describe('validateAgainstSchema', () => {
    it('should warn about non-existent tables', () => {
      const sql = 'SELECT * FROM non_existent_table';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.warnings.some(w => w.includes('non_existent_table'))).toBe(true);
    });

    it('should warn about non-existent columns', () => {
      const sql = 'SELECT id, non_existent_column FROM sales';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.warnings.some(w => w.includes('non_existent_column'))).toBe(true);
    });

    it('should accept valid table and column references', () => {
      const sql = 'SELECT id, product, amount FROM sales';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(true);
      expect(result.warnings.filter(w => w.includes('not found')).length).toBe(0);
    });

    it('should not warn about SELECT *', () => {
      const sql = 'SELECT * FROM sales';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.warnings.filter(w => w.includes('Column')).length).toBe(0);
    });
  });

  describe('checkComplexity', () => {
    it('should warn about missing LIMIT clause', () => {
      const sql = 'SELECT * FROM sales';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.warnings.some(w => w.includes('LIMIT'))).toBe(true);
    });

    it('should not warn when LIMIT is present', () => {
      const sql = 'SELECT * FROM sales LIMIT 100';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.warnings.filter(w => w.includes('LIMIT clause')).length).toBe(0);
    });

    it('should warn about multiple JOINs', () => {
      const sql = `
        SELECT * FROM sales s
        JOIN customers c1 ON s.id = c1.id
        JOIN customers c2 ON s.id = c2.id
        JOIN customers c3 ON s.id = c3.id
        JOIN customers c4 ON s.id = c4.id
      `;
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.warnings.some(w => w.includes('JOINs'))).toBe(true);
    });

    it('should warn about nested subqueries', () => {
      const sql = `
        SELECT * FROM (
          SELECT * FROM (
            SELECT * FROM (
              SELECT * FROM sales
            )
          )
        )
      `;
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.warnings.some(w => w.includes('subqueries'))).toBe(true);
    });
  });

  describe('sanitize', () => {
    it('should remove line comments', () => {
      const sql = 'SELECT * FROM sales -- this is a comment';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.sanitizedSQL).not.toContain('--');
      expect(result.sanitizedSQL).not.toContain('comment');
    });

    it('should remove block comments', () => {
      const sql = 'SELECT * FROM sales /* block comment */';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.sanitizedSQL).not.toContain('/*');
      expect(result.sanitizedSQL).not.toContain('*/');
    });

    it('should normalize whitespace', () => {
      const sql = 'SELECT   *   FROM   sales   LIMIT   10';
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.sanitizedSQL).toBe('SELECT * FROM sales LIMIT 10');
    });
  });

  describe('rewriteForDuckDB', () => {
    it('should add LIMIT if not present', () => {
      const sql = 'SELECT * FROM sales';
      const rewritten = SQLValidator.rewriteForDuckDB(sql);

      expect(rewritten).toContain('LIMIT 1000');
    });

    it('should not add LIMIT if already present', () => {
      const sql = 'SELECT * FROM sales LIMIT 50';
      const rewritten = SQLValidator.rewriteForDuckDB(sql);

      expect(rewritten).toBe(sql);
      expect(rewritten.match(/LIMIT/g)?.length).toBe(1);
    });
  });

  describe('preview', () => {
    it('should return preview with validation results', () => {
      const sql = 'SELECT * FROM sales LIMIT 10';
      const preview = SQLValidator.preview(sql, testSchema);

      expect(preview).toHaveProperty('sql');
      expect(preview).toHaveProperty('validation');
      expect(preview.validation.valid).toBe(true);
    });

    it('should return sanitized SQL in preview', () => {
      const sql = 'SELECT * FROM sales -- comment';
      const preview = SQLValidator.preview(sql, testSchema);

      expect(preview.sql).not.toContain('--');
    });

    it('should estimate row count from LIMIT', () => {
      const sql = 'SELECT * FROM sales LIMIT 100';
      const preview = SQLValidator.preview(sql, testSchema);

      expect(preview.estimatedRowCount).toBe(100);
    });
  });

  describe('Complex Queries', () => {
    it('should validate complex SELECT with JOINs and WHERE', () => {
      const sql = `
        SELECT s.id, s.product, s.amount, c.name
        FROM sales s
        JOIN customers c ON s.id = c.id
        WHERE s.amount > 100
        ORDER BY s.date DESC
        LIMIT 50
      `;
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(true);
    });

    it('should validate aggregations', () => {
      const sql = `
        SELECT product, SUM(amount) as total, COUNT(*) as count
        FROM sales
        GROUP BY product
        HAVING SUM(amount) > 1000
        ORDER BY total DESC
        LIMIT 10
      `;
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(true);
    });

    it('should validate subqueries in WHERE', () => {
      const sql = `
        SELECT * FROM sales
        WHERE amount > (SELECT AVG(amount) FROM sales)
        LIMIT 100
      `;
      const result = SQLValidator.validate(sql, testSchema);

      expect(result.valid).toBe(true);
    });
  });
});
