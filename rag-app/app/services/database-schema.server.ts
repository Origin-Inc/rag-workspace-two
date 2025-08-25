// Database Block Schema & Storage Layer Service
// Implements comprehensive column types, validation, and storage optimization

import { z } from 'zod';
import type {
  DatabaseColumnCore,
  DatabaseColumnType,
  SelectOption,
  FormulaConfig,
  RelationConfig,
  RollupConfig,
  FormatConfig
} from '~/types/database-block-core';

// ============= Column Type Registry =============

export interface ColumnTypeHandler {
  type: DatabaseColumnType;
  name: string;
  icon: string;
  defaultValue: any;
  
  // Validation
  validate: (value: any, column: DatabaseColumnCore) => boolean;
  validateSchema: z.ZodSchema<any>;
  
  // Conversion
  serialize: (value: any) => any; // For JSONB storage
  deserialize: (value: any) => any; // From JSONB storage
  
  // Formatting
  format: (value: any, column: DatabaseColumnCore) => string;
  parse: (input: string, column: DatabaseColumnCore) => any;
  
  // Indexing
  requiresIndex: boolean;
  indexType?: 'btree' | 'gin' | 'gist' | 'hash';
  
  // Storage optimization
  storageHints?: {
    compress?: boolean;
    separate?: boolean; // Store in separate table for large data
    cache?: boolean;
  };
}

// ============= Column Type Implementations =============

const columnTypes = new Map<DatabaseColumnType, ColumnTypeHandler>();

// Text Column
columnTypes.set('text', {
  type: 'text',
  name: 'Text',
  icon: '📝',
  defaultValue: '',
  validate: (value) => typeof value === 'string' || value === null,
  validateSchema: z.string().nullable(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value) => value?.toString() || '',
  parse: (input) => input,
  requiresIndex: false
});

// Number Column
columnTypes.set('number', {
  type: 'number',
  name: 'Number',
  icon: '🔢',
  defaultValue: 0,
  validate: (value) => typeof value === 'number' || value === null,
  validateSchema: z.number().nullable(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value, column) => {
    if (value === null || value === undefined) return '';
    const format = column.format as FormatConfig;
    let formatted = value.toString();
    
    if (format?.decimals !== undefined) {
      formatted = value.toFixed(format.decimals);
    }
    if (format?.thousandsSeparator) {
      formatted = formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    if (format?.prefix) formatted = format.prefix + formatted;
    if (format?.suffix) formatted = formatted + format.suffix;
    
    return formatted;
  },
  parse: (input) => {
    const num = parseFloat(input.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? null : num;
  },
  requiresIndex: true,
  indexType: 'btree'
});

// Date Column
columnTypes.set('date', {
  type: 'date',
  name: 'Date',
  icon: '📅',
  defaultValue: null,
  validate: (value) => value === null || value instanceof Date || typeof value === 'string',
  validateSchema: z.union([z.date(), z.string()]).nullable(),
  serialize: (value) => value ? new Date(value).toISOString().split('T')[0] : null,
  deserialize: (value) => value ? new Date(value) : null,
  format: (value) => {
    if (!value) return '';
    const date = new Date(value);
    return date.toLocaleDateString();
  },
  parse: (input) => {
    if (!input) return null;
    const date = new Date(input);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  },
  requiresIndex: true,
  indexType: 'btree'
});

// DateTime Column
columnTypes.set('datetime', {
  type: 'datetime',
  name: 'Date & Time',
  icon: '🕐',
  defaultValue: null,
  validate: (value) => value === null || value instanceof Date || typeof value === 'string',
  validateSchema: z.union([z.date(), z.string()]).nullable(),
  serialize: (value) => value ? new Date(value).toISOString() : null,
  deserialize: (value) => value ? new Date(value) : null,
  format: (value) => {
    if (!value) return '';
    const date = new Date(value);
    return date.toLocaleString();
  },
  parse: (input) => {
    if (!input) return null;
    const date = new Date(input);
    return isNaN(date.getTime()) ? null : date.toISOString();
  },
  requiresIndex: true,
  indexType: 'btree'
});

// Checkbox Column
columnTypes.set('checkbox', {
  type: 'checkbox',
  name: 'Checkbox',
  icon: '☑️',
  defaultValue: false,
  validate: (value) => typeof value === 'boolean' || value === null,
  validateSchema: z.boolean().nullable(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value) => value ? '✓' : '',
  parse: (input) => input === 'true' || input === '1' || input === 'yes',
  requiresIndex: false
});

// Select Column
columnTypes.set('select', {
  type: 'select',
  name: 'Select',
  icon: '📋',
  defaultValue: null,
  validate: (value, column) => {
    if (value === null) return true;
    const options = column.options || [];
    return options.some(opt => opt.id === value);
  },
  validateSchema: z.string().nullable(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value, column) => {
    if (!value) return '';
    const option = column.options?.find(opt => opt.id === value);
    return option?.label || value;
  },
  parse: (input, column) => {
    if (!input) return null;
    const option = column.options?.find(opt => 
      opt.label.toLowerCase() === input.toLowerCase() || opt.id === input
    );
    return option?.id || null;
  },
  requiresIndex: true,
  indexType: 'btree'
});

// Multi-Select Column
columnTypes.set('multi_select', {
  type: 'multi_select',
  name: 'Multi-select',
  icon: '🏷️',
  defaultValue: [],
  validate: (value, column) => {
    if (!Array.isArray(value)) return false;
    const options = column.options || [];
    const optionIds = new Set(options.map(opt => opt.id));
    return value.every(v => optionIds.has(v));
  },
  validateSchema: z.array(z.string()),
  serialize: (value) => value || [],
  deserialize: (value) => value || [],
  format: (value, column) => {
    if (!value || !Array.isArray(value)) return '';
    return value.map(v => {
      const option = column.options?.find(opt => opt.id === v);
      return option?.label || v;
    }).join(', ');
  },
  parse: (input, column) => {
    if (!input) return [];
    const values = input.split(',').map(s => s.trim());
    return values.map(v => {
      const option = column.options?.find(opt => 
        opt.label.toLowerCase() === v.toLowerCase() || opt.id === v
      );
      return option?.id || v;
    }).filter(Boolean);
  },
  requiresIndex: true,
  indexType: 'gin',
  storageHints: {
    compress: true
  }
});

// URL Column
columnTypes.set('url', {
  type: 'url',
  name: 'URL',
  icon: '🔗',
  defaultValue: null,
  validate: (value) => {
    if (!value || typeof value !== 'string') return value === null;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  validateSchema: z.string().url().nullable(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value) => value || '',
  parse: (input) => {
    if (!input) return null;
    // Add protocol if missing
    if (!input.match(/^https?:\/\//)) {
      input = 'https://' + input;
    }
    try {
      new URL(input);
      return input;
    } catch {
      return null;
    }
  },
  requiresIndex: false
});

// Email Column
columnTypes.set('email', {
  type: 'email',
  name: 'Email',
  icon: '✉️',
  defaultValue: null,
  validate: (value) => {
    if (!value || typeof value !== 'string') return value === null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  },
  validateSchema: z.string().email().nullable().optional(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value) => value || '',
  parse: (input) => {
    if (!input) return null;
    const email = input.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  },
  requiresIndex: true,
  indexType: 'btree'
});

// Phone Column
columnTypes.set('phone', {
  type: 'phone',
  name: 'Phone',
  icon: '📞',
  defaultValue: null,
  validate: (value) => {
    if (!value || typeof value !== 'string') return value === null;
    // Basic phone validation - can be enhanced
    return /^[+\d\s\-()]+$/.test(value);
  },
  validateSchema: z.string().regex(/^[+\d\s\-()]+$/).nullable(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value) => value || '',
  parse: (input) => {
    if (!input) return null;
    // Remove all non-digit characters except +
    return input.replace(/[^\d+]/g, '');
  },
  requiresIndex: false
});

// Currency Column
columnTypes.set('currency', {
  type: 'currency',
  name: 'Currency',
  icon: '💰',
  defaultValue: 0,
  validate: (value) => typeof value === 'number' || value === null,
  validateSchema: z.number().nullable(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value, column) => {
    if (value === null || value === undefined) return '';
    const format = column.format as FormatConfig;
    const currency = format?.prefix || '$';
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: format?.decimals ?? 2,
      maximumFractionDigits: format?.decimals ?? 2
    }).format(value);
    return formatted;
  },
  parse: (input) => {
    const num = parseFloat(input.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? null : num;
  },
  requiresIndex: true,
  indexType: 'btree'
});

// Percent Column
columnTypes.set('percent', {
  type: 'percent',
  name: 'Percent',
  icon: '%',
  defaultValue: 0,
  validate: (value) => typeof value === 'number' || value === null,
  validateSchema: z.number().min(0).max(100).nullable(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value, column) => {
    if (value === null || value === undefined) return '';
    const format = column.format as FormatConfig;
    const decimals = format?.decimals ?? 0;
    return value.toFixed(decimals) + '%';
  },
  parse: (input) => {
    const num = parseFloat(input.replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? null : Math.min(100, Math.max(0, num));
  },
  requiresIndex: false
});

// Rating Column
columnTypes.set('rating', {
  type: 'rating',
  name: 'Rating',
  icon: '⭐',
  defaultValue: 0,
  validate: (value) => {
    if (value === null) return true;
    return typeof value === 'number' && value >= 0 && value <= 5;
  },
  validateSchema: z.number().min(0).max(5).nullable(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value) => {
    if (value === null || value === undefined) return '';
    return '⭐'.repeat(Math.floor(value)) + '☆'.repeat(5 - Math.floor(value));
  },
  parse: (input) => {
    const num = parseInt(input);
    return isNaN(num) ? null : Math.min(5, Math.max(0, num));
  },
  requiresIndex: false
});

// Rich Text Column (stores as HTML or markdown)
columnTypes.set('rich_text', {
  type: 'rich_text',
  name: 'Rich Text',
  icon: '📄',
  defaultValue: '',
  validate: (value) => typeof value === 'string' || value === null,
  validateSchema: z.string().nullable(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value) => {
    if (!value) return '';
    // Strip HTML tags for display
    return value.replace(/<[^>]*>/g, '');
  },
  parse: (input) => input,
  requiresIndex: false,
  storageHints: {
    compress: true,
    separate: true // Store in separate table if very large
  }
});

// Files Column
columnTypes.set('files', {
  type: 'files',
  name: 'Files',
  icon: '📎',
  defaultValue: [],
  validate: (value) => Array.isArray(value) || value === null,
  validateSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    size: z.number().optional(),
    type: z.string().optional()
  })).nullable(),
  serialize: (value) => value || [],
  deserialize: (value) => value || [],
  format: (value) => {
    if (!value || !Array.isArray(value)) return '';
    return value.map(f => f.name).join(', ');
  },
  parse: (input) => {
    // Can't parse files from text input
    return [];
  },
  requiresIndex: false,
  storageHints: {
    compress: true,
    separate: true
  }
});

// Created Time Column (auto-populated)
columnTypes.set('created_time', {
  type: 'created_time',
  name: 'Created Time',
  icon: '🕐',
  defaultValue: null,
  validate: () => true, // Always valid as it's system-managed
  validateSchema: z.string(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value) => {
    if (!value) return '';
    return new Date(value).toLocaleString();
  },
  parse: () => new Date().toISOString(), // Always returns current time
  requiresIndex: true,
  indexType: 'btree'
});

// Updated Time Column (auto-populated)
columnTypes.set('updated_time', {
  type: 'updated_time',
  name: 'Updated Time',
  icon: '🕐',
  defaultValue: null,
  validate: () => true,
  validateSchema: z.string(),
  serialize: (value) => value,
  deserialize: (value) => value,
  format: (value) => {
    if (!value) return '';
    return new Date(value).toLocaleString();
  },
  parse: () => new Date().toISOString(),
  requiresIndex: true,
  indexType: 'btree'
});

// ============= Schema Service =============

export class DatabaseSchemaService {
  
  /**
   * Get handler for a column type
   */
  getColumnTypeHandler(type: DatabaseColumnType): ColumnTypeHandler | undefined {
    return columnTypes.get(type);
  }

  /**
   * Get all available column types
   */
  getAllColumnTypes(): ColumnTypeHandler[] {
    return Array.from(columnTypes.values());
  }

  /**
   * Validate a value against a column's type and rules
   */
  validateValue(value: any, column: DatabaseColumnCore): { 
    valid: boolean; 
    error?: string 
  } {
    const handler = this.getColumnTypeHandler(column.type);
    if (!handler) {
      return { valid: false, error: `Unknown column type: ${column.type}` };
    }

    try {
      // Type validation
      if (!handler.validate(value, column)) {
        return { valid: false, error: `Invalid value for ${column.type} column` };
      }

      // Required validation
      if (column.isRequired && (value === null || value === undefined || value === '')) {
        return { valid: false, error: `${column.name} is required` };
      }

      // Schema validation
      handler.validateSchema.parse(value);

      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { valid: false, error: error.errors[0].message };
      }
      return { valid: false, error: String(error) };
    }
  }

  /**
   * Serialize row data for JSONB storage
   */
  serializeRowData(data: Record<string, any>, schema: DatabaseColumnCore[]): Record<string, any> {
    const serialized: Record<string, any> = {};
    
    for (const column of schema) {
      const value = data[column.id];
      const handler = this.getColumnTypeHandler(column.type);
      
      if (handler) {
        serialized[column.id] = handler.serialize(value);
      } else {
        serialized[column.id] = value;
      }
    }
    
    return serialized;
  }

  /**
   * Deserialize row data from JSONB storage
   */
  deserializeRowData(data: Record<string, any>, schema: DatabaseColumnCore[]): Record<string, any> {
    const deserialized: Record<string, any> = {};
    
    for (const column of schema) {
      const value = data[column.id];
      const handler = this.getColumnTypeHandler(column.type);
      
      if (handler) {
        deserialized[column.id] = handler.deserialize(value);
      } else {
        deserialized[column.id] = value;
      }
    }
    
    return deserialized;
  }

  /**
   * Format a value for display
   */
  formatValue(value: any, column: DatabaseColumnCore): string {
    const handler = this.getColumnTypeHandler(column.type);
    return handler ? handler.format(value, column) : String(value || '');
  }

  /**
   * Parse user input into the appropriate type
   */
  parseInput(input: string, column: DatabaseColumnCore): any {
    const handler = this.getColumnTypeHandler(column.type);
    return handler ? handler.parse(input, column) : input;
  }

  /**
   * Get columns that should be indexed
   */
  getIndexableColumns(schema: DatabaseColumnCore[]): DatabaseColumnCore[] {
    return schema.filter(column => {
      const handler = this.getColumnTypeHandler(column.type);
      return handler?.requiresIndex;
    });
  }

  /**
   * Generate index definitions for a schema
   */
  generateIndexDefinitions(tableId: string, schema: DatabaseColumnCore[]): string[] {
    const indexes: string[] = [];
    
    for (const column of this.getIndexableColumns(schema)) {
      const handler = this.getColumnTypeHandler(column.type);
      if (!handler) continue;
      
      const indexType = handler.indexType || 'btree';
      const columnPath = `data->>'${column.id}'`;
      
      let indexDef = '';
      switch (indexType) {
        case 'gin':
          indexDef = `CREATE INDEX idx_${tableId}_${column.id} ON db_block_rows_partitioned USING gin((${columnPath})) WHERE db_block_id = '${tableId}'`;
          break;
        case 'btree':
          indexDef = `CREATE INDEX idx_${tableId}_${column.id} ON db_block_rows_partitioned USING btree((${columnPath})) WHERE db_block_id = '${tableId}'`;
          break;
        default:
          indexDef = `CREATE INDEX idx_${tableId}_${column.id} ON db_block_rows_partitioned((${columnPath})) WHERE db_block_id = '${tableId}'`;
      }
      
      indexes.push(indexDef);
    }
    
    return indexes;
  }

  /**
   * Optimize storage for large datasets
   */
  getStorageOptimizations(schema: DatabaseColumnCore[]): {
    compressColumns: string[];
    separateColumns: string[];
    cacheColumns: string[];
  } {
    const optimizations = {
      compressColumns: [],
      separateColumns: [],
      cacheColumns: []
    };
    
    for (const column of schema) {
      const handler = this.getColumnTypeHandler(column.type);
      if (!handler?.storageHints) continue;
      
      if (handler.storageHints.compress) {
        optimizations.compressColumns.push(column.id);
      }
      if (handler.storageHints.separate) {
        optimizations.separateColumns.push(column.id);
      }
      if (handler.storageHints.cache) {
        optimizations.cacheColumns.push(column.id);
      }
    }
    
    return optimizations;
  }

  /**
   * Validate an entire schema
   */
  validateSchema(schema: DatabaseColumnCore[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const columnIds = new Set<string>();
    
    for (const column of schema) {
      // Check for duplicate IDs
      if (columnIds.has(column.id)) {
        errors.push(`Duplicate column ID: ${column.id}`);
      }
      columnIds.add(column.id);
      
      // Check column type exists
      if (!this.getColumnTypeHandler(column.type)) {
        errors.push(`Unknown column type: ${column.type} for column ${column.id}`);
      }
      
      // Validate column-specific configurations
      if (column.type === 'select' || column.type === 'multi_select') {
        if (!column.options || column.options.length === 0) {
          errors.push(`${column.name} requires at least one option`);
        }
      }
      
      if (column.type === 'relation' && !column.relation) {
        errors.push(`${column.name} requires relation configuration`);
      }
      
      if (column.type === 'rollup' && !column.rollup) {
        errors.push(`${column.name} requires rollup configuration`);
      }
      
      if (column.type === 'formula' && !column.formula) {
        errors.push(`${column.name} requires formula configuration`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export const databaseSchemaService = new DatabaseSchemaService();