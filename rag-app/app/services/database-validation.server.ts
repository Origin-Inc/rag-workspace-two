// Database Validation Service
// Comprehensive validation rules and data integrity checks

import { z } from 'zod';
import type { DatabaseColumnCore, DatabaseRowCore } from '~/types/database-block-core';
import { databaseSchemaService } from './database-schema.server';

export interface ValidationRule {
  id: string;
  name: string;
  type: 'required' | 'unique' | 'pattern' | 'range' | 'length' | 'custom';
  message?: string;
  config?: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  columnId: string;
  rowId?: string;
  message: string;
  value?: any;
}

export interface ValidationWarning {
  columnId: string;
  rowId?: string;
  message: string;
  suggestion?: string;
}

export class DatabaseValidationService {
  
  /**
   * Validate a single row against schema
   */
  async validateRow(
    row: DatabaseRowCore,
    schema: DatabaseColumnCore[]
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    for (const column of schema) {
      const value = row.data[column.id];
      
      // Skip validation for undefined/null values on optional fields
      if (!column.isRequired && (value === undefined || value === null)) {
        continue;
      }
      
      // Type validation
      const typeValidation = databaseSchemaService.validateValue(value, column);
      if (!typeValidation.valid) {
        errors.push({
          columnId: column.id,
          rowId: row.id,
          message: typeValidation.error!,
          value
        });
        continue;
      }
      
      // Required validation
      if (column.isRequired) {
        if (value === null || value === undefined || value === '') {
          errors.push({
            columnId: column.id,
            rowId: row.id,
            message: `${column.name} is required`
          });
        }
      }
      
      // Unique validation (would need to check against other rows)
      if (column.isUnique && value !== null) {
        // This would need database access to check uniqueness
        // Placeholder for now
      }
      
      // Column-specific validations
      await this.validateColumnSpecific(column, value, row.id, errors, warnings);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Validate multiple rows in batch
   */
  async validateBatch(
    rows: DatabaseRowCore[],
    schema: DatabaseColumnCore[]
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // Check for duplicate values in unique columns
    const uniqueColumns = schema.filter(col => col.isUnique);
    for (const column of uniqueColumns) {
      const values = new Map<any, string[]>();
      
      for (const row of rows) {
        const value = row.data[column.id];
        if (value !== null && value !== undefined) {
          if (!values.has(value)) {
            values.set(value, []);
          }
          values.get(value)!.push(row.id);
        }
      }
      
      // Report duplicates
      for (const [value, rowIds] of values.entries()) {
        if (rowIds.length > 1) {
          errors.push({
            columnId: column.id,
            message: `Duplicate value "${value}" in unique column ${column.name}`,
            value,
            rowId: rowIds.join(', ')
          });
        }
      }
    }
    
    // Validate each row
    for (const row of rows) {
      const result = await this.validateRow(row, schema);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Column-specific validation rules
   */
  private async validateColumnSpecific(
    column: DatabaseColumnCore,
    value: any,
    rowId: string,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ) {
    switch (column.type) {
      case 'email':
        if (value && !this.isValidEmail(value)) {
          errors.push({
            columnId: column.id,
            rowId,
            message: 'Invalid email format',
            value
          });
        }
        break;
        
      case 'url':
        if (value && !this.isValidUrl(value)) {
          errors.push({
            columnId: column.id,
            rowId,
            message: 'Invalid URL format',
            value
          });
        }
        break;
        
      case 'phone':
        if (value && !this.isValidPhone(value)) {
          warnings.push({
            columnId: column.id,
            rowId,
            message: 'Phone number may not be valid',
            suggestion: 'Use international format (e.g., +1234567890)'
          });
        }
        break;
        
      case 'percent':
        if (value !== null && (value < 0 || value > 100)) {
          errors.push({
            columnId: column.id,
            rowId,
            message: 'Percentage must be between 0 and 100',
            value
          });
        }
        break;
        
      case 'rating':
        if (value !== null && (value < 0 || value > 5)) {
          errors.push({
            columnId: column.id,
            rowId,
            message: 'Rating must be between 0 and 5',
            value
          });
        }
        break;
        
      case 'select':
        if (value && column.options) {
          const validOptions = column.options.map(opt => opt.id);
          if (!validOptions.includes(value)) {
            errors.push({
              columnId: column.id,
              rowId,
              message: `Invalid option: ${value}`,
              value
            });
          }
        }
        break;
        
      case 'multi_select':
        if (value && Array.isArray(value) && column.options) {
          const validOptions = new Set(column.options.map(opt => opt.id));
          const invalidOptions = value.filter(v => !validOptions.has(v));
          
          if (invalidOptions.length > 0) {
            errors.push({
              columnId: column.id,
              rowId,
              message: `Invalid options: ${invalidOptions.join(', ')}`,
              value: invalidOptions
            });
          }
        }
        break;
    }
  }
  
  /**
   * Create validation schema for a column
   */
  createColumnSchema(column: DatabaseColumnCore): z.ZodSchema<any> {
    let schema: z.ZodSchema<any>;
    
    switch (column.type) {
      case 'text':
      case 'rich_text':
        schema = z.string();
        break;
        
      case 'number':
      case 'currency':
        schema = z.number();
        break;
        
      case 'percent':
        schema = z.number().min(0).max(100);
        break;
        
      case 'rating':
        schema = z.number().min(0).max(5);
        break;
        
      case 'checkbox':
        schema = z.boolean();
        break;
        
      case 'date':
      case 'datetime':
      case 'created_time':
      case 'updated_time':
        schema = z.string().datetime();
        break;
        
      case 'email':
        schema = z.string().email();
        break;
        
      case 'url':
        schema = z.string().url();
        break;
        
      case 'phone':
        schema = z.string().regex(/^[+\d\s\-()]+$/);
        break;
        
      case 'select':
        if (column.options) {
          const validOptions = column.options.map(opt => opt.id);
          schema = z.enum(validOptions as [string, ...string[]]);
        } else {
          schema = z.string();
        }
        break;
        
      case 'multi_select':
        if (column.options) {
          const validOptions = column.options.map(opt => opt.id);
          schema = z.array(z.enum(validOptions as [string, ...string[]]));
        } else {
          schema = z.array(z.string());
        }
        break;
        
      case 'files':
        schema = z.array(z.object({
          id: z.string(),
          name: z.string(),
          url: z.string(),
          size: z.number().optional(),
          type: z.string().optional()
        }));
        break;
        
      default:
        schema = z.any();
    }
    
    // Add required/optional modifier
    if (!column.isRequired) {
      schema = schema.nullable().optional();
    }
    
    return schema;
  }
  
  /**
   * Create validation schema for entire row
   */
  createRowSchema(columns: DatabaseColumnCore[]): z.ZodSchema<any> {
    const shape: Record<string, z.ZodSchema<any>> = {};
    
    for (const column of columns) {
      shape[column.id] = this.createColumnSchema(column);
    }
    
    return z.object(shape);
  }
  
  /**
   * Validate data before import
   */
  async validateImportData(
    data: any[],
    schema: DatabaseColumnCore[],
    options: {
      skipInvalid?: boolean;
      autoCorrect?: boolean;
    } = {}
  ): Promise<{
    valid: any[];
    invalid: any[];
    corrections: Map<number, Record<string, any>>;
  }> {
    const valid: any[] = [];
    const invalid: any[] = [];
    const corrections = new Map<number, Record<string, any>>();
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const corrected: Record<string, any> = {};
      let hasCorrections = false;
      let isValid = true;
      
      for (const column of schema) {
        const value = row[column.id];
        
        // Try to auto-correct if enabled
        if (options.autoCorrect && value !== null) {
          const correctedValue = this.autoCorrectValue(value, column);
          if (correctedValue !== value) {
            corrected[column.id] = correctedValue;
            hasCorrections = true;
          }
        }
        
        // Validate
        const finalValue = corrected[column.id] ?? value;
        const validation = databaseSchemaService.validateValue(finalValue, column);
        
        if (!validation.valid) {
          isValid = false;
          if (!options.skipInvalid) {
            break;
          }
        }
      }
      
      if (isValid) {
        valid.push(hasCorrections ? { ...row, ...corrected } : row);
        if (hasCorrections) {
          corrections.set(i, corrected);
        }
      } else {
        invalid.push(row);
      }
    }
    
    return { valid, invalid, corrections };
  }
  
  /**
   * Auto-correct common data issues
   */
  private autoCorrectValue(value: any, column: DatabaseColumnCore): any {
    switch (column.type) {
      case 'email':
        if (typeof value === 'string') {
          return value.trim().toLowerCase();
        }
        break;
        
      case 'url':
        if (typeof value === 'string' && !value.startsWith('http')) {
          return 'https://' + value;
        }
        break;
        
      case 'phone':
        if (typeof value === 'string') {
          // Remove all non-digit characters except +
          return value.replace(/[^\d+]/g, '');
        }
        break;
        
      case 'number':
      case 'currency':
      case 'percent':
        if (typeof value === 'string') {
          const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
          return isNaN(num) ? null : num;
        }
        break;
        
      case 'checkbox':
        if (typeof value === 'string') {
          return value.toLowerCase() === 'true' || value === '1' || value === 'yes';
        }
        break;
        
      case 'date':
      case 'datetime':
        if (typeof value === 'string') {
          try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              return column.type === 'date' 
                ? date.toISOString().split('T')[0]
                : date.toISOString();
            }
          } catch {
            // Invalid date
          }
        }
        break;
    }
    
    return value;
  }
  
  // Validation helpers
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  private isValidPhone(phone: string): boolean {
    // Basic validation - can be enhanced with libphonenumber
    return /^[+]?[\d\s\-()]+$/.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }
}

export const databaseValidationService = new DatabaseValidationService();