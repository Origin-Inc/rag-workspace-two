/**
 * SQL Validator Service
 *
 * Validates generated SQL queries for safety, correctness, and DuckDB compatibility.
 * Prevents SQL injection, destructive operations, and schema mismatches.
 *
 * Related: Task #54.3 (SQL Generation and Validation Layer)
 */

import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('sql-validator');

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedSQL?: string;
}

export interface SchemaInfo {
  tableName: string;
  columns: Array<{ name: string; type: string }>;
}

export class SQLValidator {
  /**
   * Validate SQL for safety and correctness
   */
  static validate(sql: string, schemas?: SchemaInfo[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!sql || sql.trim().length === 0) {
      errors.push('SQL query is empty');
      return { valid: false, errors, warnings };
    }

    const trimmedSQL = sql.trim();

    // 1. Check for destructive operations
    const destructiveCheck = this.checkDestructiveOperations(trimmedSQL);
    if (!destructiveCheck.valid) {
      errors.push(...destructiveCheck.errors);
    }

    // 2. Check SQL starts with SELECT
    if (!trimmedSQL.toUpperCase().startsWith('SELECT')) {
      errors.push('Query must be a SELECT statement');
    }

    // 3. Check for SQL injection patterns
    const injectionCheck = this.checkSQLInjection(trimmedSQL);
    if (!injectionCheck.valid) {
      errors.push(...injectionCheck.errors);
    }
    warnings.push(...injectionCheck.warnings);

    // 4. Check for DuckDB-specific syntax issues
    const syntaxCheck = this.checkDuckDBSyntax(trimmedSQL);
    warnings.push(...syntaxCheck.warnings);

    // 5. Validate against schema if provided
    if (schemas && schemas.length > 0) {
      const schemaCheck = this.validateAgainstSchema(trimmedSQL, schemas);
      warnings.push(...schemaCheck.warnings);
    }

    // 6. Check query complexity
    const complexityCheck = this.checkComplexity(trimmedSQL);
    warnings.push(...complexityCheck.warnings);

    const valid = errors.length === 0;

    return {
      valid,
      errors,
      warnings,
      sanitizedSQL: valid ? this.sanitize(trimmedSQL) : undefined
    };
  }

  /**
   * Check for destructive operations (DROP, DELETE, ALTER, etc.)
   */
  private static checkDestructiveOperations(sql: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const dangerousPatterns = [
      { pattern: /\bDROP\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX)\b/i, name: 'DROP' },
      { pattern: /\bDELETE\s+FROM\b/i, name: 'DELETE' },
      { pattern: /\bTRUNCATE\s+TABLE\b/i, name: 'TRUNCATE' },
      { pattern: /\bALTER\s+TABLE\b/i, name: 'ALTER TABLE' },
      { pattern: /\bCREATE\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX)\b/i, name: 'CREATE' },
      { pattern: /\bINSERT\s+INTO\b/i, name: 'INSERT' },
      { pattern: /\bUPDATE\s+\w+\s+SET\b/i, name: 'UPDATE' },
      { pattern: /\bGRANT\s+/i, name: 'GRANT' },
      { pattern: /\bREVOKE\s+/i, name: 'REVOKE' }
    ];

    for (const { pattern, name } of dangerousPatterns) {
      if (pattern.test(sql)) {
        errors.push(`Potentially destructive operation detected: ${name}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check for SQL injection patterns
   */
  private static checkSQLInjection(sql: string): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for common SQL injection patterns
    const injectionPatterns = [
      { pattern: /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE)/i, severity: 'error', message: 'Multiple statements detected (potential SQL injection)' },
      { pattern: /--/m, severity: 'warning', message: 'SQL comment detected' },
      { pattern: /\/\*.*\*\//s, severity: 'warning', message: 'Block comment detected' },
      { pattern: /\bOR\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i, severity: 'error', message: 'Tautology detected (OR 1=1)' },
      { pattern: /\bAND\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i, severity: 'warning', message: 'Tautology detected (AND 1=1)' },
      { pattern: /\bUNION\s+SELECT\b/i, severity: 'warning', message: 'UNION SELECT detected' }
    ];

    for (const { pattern, severity, message } of injectionPatterns) {
      if (pattern.test(sql)) {
        if (severity === 'error') {
          errors.push(message);
        } else {
          warnings.push(message);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Check DuckDB-specific syntax
   */
  private static checkDuckDBSyntax(sql: string): { warnings: string[] } {
    const warnings: string[] = [];

    // Check for common syntax issues
    if (sql.includes('LIMIT') && !sql.match(/LIMIT\s+\d+/i)) {
      warnings.push('LIMIT clause should have a numeric value');
    }

    // Check for proper string quoting (DuckDB uses single quotes)
    if (sql.match(/"\w+"\s*=\s*\w+/) && !sql.match(/'\w+'/)) {
      warnings.push('Consider using single quotes for string literals in DuckDB');
    }

    return { warnings };
  }

  /**
   * Validate against table schemas
   */
  private static validateAgainstSchema(sql: string, schemas: SchemaInfo[]): { warnings: string[] } {
    const warnings: string[] = [];

    // Extract table names from SQL
    const tablePattern = /FROM\s+(\w+)|JOIN\s+(\w+)/gi;
    const matches = [...sql.matchAll(tablePattern)];
    const referencedTables = matches.map(m => m[1] || m[2]).filter(Boolean);

    // Check if referenced tables exist in schema
    const schemaTableNames = schemas.map(s => s.tableName.toLowerCase());
    for (const table of referencedTables) {
      if (!schemaTableNames.includes(table.toLowerCase())) {
        warnings.push(`Table '${table}' not found in schema`);
      }
    }

    // Extract column names from SELECT clause
    const selectPattern = /SELECT\s+(.*?)\s+FROM/is;
    const selectMatch = sql.match(selectPattern);
    if (selectMatch) {
      const selectClause = selectMatch[1];

      // Skip validation for SELECT *
      if (!selectClause.includes('*')) {
        const columns = selectClause.split(',').map(c => {
          // Extract column name (handle aliases and functions)
          const colMatch = c.trim().match(/(?:\w+\.)?(\w+)(?:\s+AS\s+\w+)?/i);
          return colMatch ? colMatch[1] : null;
        }).filter(Boolean);

        // Check if columns exist in schema
        for (const col of columns) {
          const found = schemas.some(schema =>
            schema.columns.some(schemaCol =>
              schemaCol.name.toLowerCase() === col.toLowerCase()
            )
          );

          if (!found) {
            warnings.push(`Column '${col}' not found in schema`);
          }
        }
      }
    }

    return { warnings };
  }

  /**
   * Check query complexity to prevent resource-intensive operations
   */
  private static checkComplexity(sql: string): { warnings: string[] } {
    const warnings: string[] = [];

    // Check for potentially expensive operations
    if (!sql.includes('LIMIT')) {
      warnings.push('Consider adding LIMIT clause to prevent large result sets');
    }

    // Check for multiple JOINs (potentially expensive)
    const joinCount = (sql.match(/\bJOIN\b/gi) || []).length;
    if (joinCount > 3) {
      warnings.push(`Query has ${joinCount} JOINs which may be slow`);
    }

    // Check for nested subqueries
    const subqueryCount = (sql.match(/\(\s*SELECT\b/gi) || []).length;
    if (subqueryCount > 2) {
      warnings.push(`Query has ${subqueryCount} subqueries which may impact performance`);
    }

    return { warnings };
  }

  /**
   * Sanitize SQL by removing comments and normalizing whitespace
   */
  private static sanitize(sql: string): string {
    // Remove SQL comments
    let sanitized = sql.replace(/--.*$/gm, ''); // Line comments
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, ''); // Block comments

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }

  /**
   * Rewrite query for DuckDB-specific optimizations
   */
  static rewriteForDuckDB(sql: string): string {
    let rewritten = sql;

    // Add LIMIT if not present (default to 1000)
    if (!rewritten.match(/LIMIT\s+\d+/i)) {
      rewritten += ' LIMIT 1000';
    }

    return rewritten;
  }

  /**
   * Preview SQL query before execution
   */
  static preview(sql: string, schemas?: SchemaInfo[]): {
    sql: string;
    validation: ValidationResult;
    estimatedRowCount?: number;
  } {
    const validation = this.validate(sql, schemas);

    return {
      sql: validation.sanitizedSQL || sql,
      validation,
      estimatedRowCount: this.estimateRowCount(sql, schemas)
    };
  }

  /**
   * Estimate result row count based on query patterns
   */
  private static estimateRowCount(sql: string, schemas?: SchemaInfo[]): number | undefined {
    // Extract LIMIT clause
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      return parseInt(limitMatch[1], 10);
    }

    // If no LIMIT and we have schema info, estimate based on table size
    if (schemas && schemas.length > 0) {
      // For simple queries without JOINs, return first table's row count estimate
      if (!sql.match(/\bJOIN\b/i)) {
        // This would be populated from actual table metadata
        return 1000; // Placeholder
      }
    }

    return undefined;
  }
}
