// Type definitions for the Database Block feature

export type DatabaseColumnType = 
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multi_select'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'currency'
  | 'percent'
  | 'rating'
  | 'user'
  | 'file'
  | 'formula'
  | 'rollup'
  | 'lookup'
  | 'created_time'
  | 'updated_time'
  | 'created_by'
  | 'updated_by';

export type AggregationType = 
  | 'count'
  | 'count_empty'
  | 'count_not_empty'
  | 'count_unique'
  | 'sum'
  | 'average'
  | 'median'
  | 'min'
  | 'max'
  | 'range'
  | 'earliest'
  | 'latest';

export type FilterOperator = 
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'between'
  | 'is_within'
  | 'is_before'
  | 'is_after';

export type ViewType = 'table' | 'gallery' | 'kanban' | 'calendar' | 'timeline';

// Database block metadata
export interface DatabaseBlock {
  id: string;
  blockId: string;
  name: string;
  description?: string;
  schema: DatabaseColumn[];
  views: DatabaseView[];
  settings: DatabaseSettings;
  rowCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Column definition
export interface DatabaseColumn {
  id: string;
  databaseBlockId: string;
  columnId: string; // Internal identifier
  name: string;
  type: DatabaseColumnType;
  position: number;
  width: number;
  isPrimary?: boolean;
  isRequired?: boolean;
  isUnique?: boolean;
  isHidden?: boolean;
  isLocked?: boolean;
  defaultValue?: any;
  options?: ColumnOptions;
  validation?: ValidationRule[];
  aggregation?: AggregationType;
  createdAt: string;
  updatedAt: string;
}

// Column-specific options
export interface ColumnOptions {
  // For select/multi-select
  choices?: SelectOption[];
  // For number/currency/percent
  precision?: number;
  prefix?: string;
  suffix?: string;
  // For date/datetime
  dateFormat?: string;
  timeFormat?: string;
  includeTime?: boolean;
  // For rating
  maxRating?: number;
  icon?: string;
  // For formula
  expression?: string;
  // For rollup
  relationId?: string;
  rollupProperty?: string;
  rollupFunction?: AggregationType;
  // For lookup
  lookupRelationId?: string;
  lookupProperty?: string;
  // For user
  allowMultiple?: boolean;
  // For file
  acceptedTypes?: string[];
  maxSize?: number;
  maxFiles?: number;
}

export interface SelectOption {
  id: string;
  value: string;
  color?: string;
  icon?: string;
}

export interface ValidationRule {
  type: 'min' | 'max' | 'regex' | 'required' | 'unique' | 'custom';
  value?: any;
  message?: string;
}

// Database row
export interface DatabaseRow {
  id: string;
  databaseBlockId: string;
  rowNumber: number;
  data: Record<string, any>; // Column ID to value mapping
  metadata: RowMetadata;
  version: number;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface RowMetadata {
  color?: string;
  icon?: string;
  tags?: string[];
  attachments?: string[];
  [key: string]: any;
}

// Database cell
export interface DatabaseCell {
  id: string;
  rowId: string;
  columnId: string;
  value: any;
  previousValue?: any;
  updatedAt: string;
  updatedBy?: string;
}

// Database view (saved filter/sort configuration)
export interface DatabaseView {
  id: string;
  databaseBlockId: string;
  name: string;
  type: ViewType;
  filters: Filter[];
  sorts: Sort[];
  visibleColumns: string[];
  groupBy?: string;
  colorBy?: string;
  isDefault?: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Filter {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value: any;
  conjunction?: 'and' | 'or';
}

export interface Sort {
  columnId: string;
  direction: 'asc' | 'desc';
  priority: number;
}

// Database settings
export interface DatabaseSettings {
  rowHeight?: 'compact' | 'normal' | 'comfortable';
  showRowNumbers?: boolean;
  showGridLines?: boolean;
  alternateRowColors?: boolean;
  wrapText?: boolean;
  frozenColumns?: number;
  defaultView?: string;
  allowInlineEdit?: boolean;
  allowRowSelection?: boolean;
  allowMultiSelect?: boolean;
  allowExport?: boolean;
  allowImport?: boolean;
}

// Activity log
export interface DatabaseActivity {
  id: string;
  databaseBlockId: string;
  rowId?: string;
  userId: string;
  action: 'created' | 'updated' | 'deleted' | 'commented' | 'imported' | 'exported';
  changes?: Record<string, any>;
  createdAt: string;
}

// Comment
export interface DatabaseRowComment {
  id: string;
  rowId: string;
  userId: string;
  content: string;
  mentions?: string[];
  isResolved?: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Request/Response types for API
export interface GetDatabaseRowsRequest {
  databaseBlockId: string;
  limit?: number;
  offset?: number;
  filters?: Filter[];
  sorts?: Sort[];
  viewId?: string;
}

export interface GetDatabaseRowsResponse {
  rows: DatabaseRow[];
  totalCount: number;
  hasMore: boolean;
}

export interface BulkUpdateRowsRequest {
  updates: Array<{
    id: string;
    data?: Record<string, any>;
    metadata?: RowMetadata;
    version: number; // For optimistic locking
  }>;
}

export interface BulkUpdateCellsRequest {
  updates: Array<{
    rowId: string;
    columnId: string;
    value: any;
  }>;
}

export interface ImportDataRequest {
  databaseBlockId: string;
  format: 'csv' | 'excel' | 'json';
  data: string | ArrayBuffer;
  mappings?: Record<string, string>; // Source column to target column
  options?: {
    skipFirstRow?: boolean;
    updateExisting?: boolean;
    keyColumn?: string;
  };
}

export interface ExportDataRequest {
  databaseBlockId: string;
  format: 'csv' | 'excel' | 'json' | 'pdf';
  filters?: Filter[];
  sorts?: Sort[];
  columns?: string[];
}

// Validation helpers
export class ColumnValidator {
  static validateValue(column: DatabaseColumn, value: any): { valid: boolean; error?: string } {
    // Check required
    if (column.isRequired && (value === null || value === undefined || value === '')) {
      return { valid: false, error: `${column.name} is required` };
    }

    // Type-specific validation
    switch (column.type) {
      case 'number':
      case 'currency':
      case 'percent':
        if (value !== null && value !== undefined && isNaN(Number(value))) {
          return { valid: false, error: `${column.name} must be a number` };
        }
        break;

      case 'email':
        if (value && !this.isValidEmail(value)) {
          return { valid: false, error: `${column.name} must be a valid email` };
        }
        break;

      case 'url':
        if (value && !this.isValidUrl(value)) {
          return { valid: false, error: `${column.name} must be a valid URL` };
        }
        break;

      case 'phone':
        if (value && !this.isValidPhone(value)) {
          return { valid: false, error: `${column.name} must be a valid phone number` };
        }
        break;

      case 'date':
      case 'datetime':
        if (value && !this.isValidDate(value)) {
          return { valid: false, error: `${column.name} must be a valid date` };
        }
        break;

      case 'select':
        if (value && column.options?.choices) {
          const validValues = column.options.choices.map(c => c.value);
          if (!validValues.includes(value)) {
            return { valid: false, error: `Invalid value for ${column.name}` };
          }
        }
        break;

      case 'multi_select':
        if (value && column.options?.choices) {
          const validValues = column.options.choices.map(c => c.value);
          const values = Array.isArray(value) ? value : [value];
          for (const v of values) {
            if (!validValues.includes(v)) {
              return { valid: false, error: `Invalid value for ${column.name}` };
            }
          }
        }
        break;

      case 'rating':
        if (value !== null && value !== undefined) {
          const max = column.options?.maxRating || 5;
          if (value < 0 || value > max) {
            return { valid: false, error: `${column.name} must be between 0 and ${max}` };
          }
        }
        break;

      case 'checkbox':
        if (value !== null && value !== undefined && typeof value !== 'boolean') {
          return { valid: false, error: `${column.name} must be true or false` };
        }
        break;
    }

    // Custom validation rules
    if (column.validation) {
      for (const rule of column.validation) {
        const result = this.applyValidationRule(rule, value);
        if (!result.valid) {
          return result;
        }
      }
    }

    return { valid: true };
  }

  private static applyValidationRule(rule: ValidationRule, value: any): { valid: boolean; error?: string } {
    switch (rule.type) {
      case 'min':
        if (value < rule.value) {
          return { valid: false, error: rule.message || `Value must be at least ${rule.value}` };
        }
        break;

      case 'max':
        if (value > rule.value) {
          return { valid: false, error: rule.message || `Value must be at most ${rule.value}` };
        }
        break;

      case 'regex':
        const regex = new RegExp(rule.value);
        if (!regex.test(value)) {
          return { valid: false, error: rule.message || 'Invalid format' };
        }
        break;

      case 'required':
        if (!value) {
          return { valid: false, error: rule.message || 'This field is required' };
        }
        break;

      case 'unique':
        // This would need to be checked against the database
        // Handled server-side
        break;

      case 'custom':
        // Custom validation function
        // Would need to be implemented based on specific requirements
        break;
    }

    return { valid: true };
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private static isValidPhone(phone: string): boolean {
    // Basic phone validation - can be enhanced
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }

  private static isValidDate(date: any): boolean {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }
}

// Formula evaluator (basic implementation)
export class FormulaEvaluator {
  static evaluate(expression: string, row: DatabaseRow, columns: DatabaseColumn[]): any {
    // This is a simplified formula evaluator
    // In production, use a proper expression parser like math.js or expr-eval
    
    let formula = expression;
    
    // Replace column references with values
    columns.forEach(column => {
      const value = row.data[column.columnId];
      const safeValue = typeof value === 'number' ? value : `"${value}"`;
      formula = formula.replace(new RegExp(`\\{${column.name}\\}`, 'g'), safeValue);
    });
    
    try {
      // WARNING: eval is dangerous - use a proper expression parser in production
      // This is just for demonstration
      return eval(formula);
    } catch (error) {
      console.error('Formula evaluation error:', error);
      return null;
    }
  }
}

// Aggregation calculator
export class AggregationCalculator {
  static calculate(
    rows: DatabaseRow[],
    columnId: string,
    aggregationType: AggregationType
  ): any {
    const values = rows
      .map(row => row.data[columnId])
      .filter(v => v !== null && v !== undefined);

    switch (aggregationType) {
      case 'count':
        return rows.length;
      
      case 'count_empty':
        return rows.length - values.length;
      
      case 'count_not_empty':
        return values.length;
      
      case 'count_unique':
        return new Set(values).size;
      
      case 'sum':
        return values.reduce((sum, val) => sum + Number(val), 0);
      
      case 'average':
        if (values.length === 0) return null;
        return values.reduce((sum, val) => sum + Number(val), 0) / values.length;
      
      case 'median':
        if (values.length === 0) return null;
        const sorted = values.map(Number).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      
      case 'min':
        return values.length > 0 ? Math.min(...values.map(Number)) : null;
      
      case 'max':
        return values.length > 0 ? Math.max(...values.map(Number)) : null;
      
      case 'range':
        if (values.length === 0) return null;
        const nums = values.map(Number);
        return Math.max(...nums) - Math.min(...nums);
      
      case 'earliest':
        if (values.length === 0) return null;
        return values.map(v => new Date(v)).sort((a, b) => a.getTime() - b.getTime())[0];
      
      case 'latest':
        if (values.length === 0) return null;
        return values.map(v => new Date(v)).sort((a, b) => b.getTime() - a.getTime())[0];
      
      default:
        return null;
    }
  }
}