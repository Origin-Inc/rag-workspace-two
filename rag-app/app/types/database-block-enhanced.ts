// Enhanced TypeScript types for high-performance database blocks
// Supports 50,000+ records with advanced features

export type DatabaseColumnTypeEnhanced = 
  // Basic types
  | 'text' | 'number' | 'date' | 'datetime' | 'checkbox' | 'url' | 'email' | 'phone'
  // Advanced types  
  | 'select' | 'multi_select' | 'currency' | 'percent' | 'rating' | 'rich_text'
  // Relation types
  | 'relation' | 'rollup' | 'lookup' | 'people' | 'files'
  // Computed types
  | 'formula' | 'count' | 'created_time' | 'updated_time' | 'created_by' | 'updated_by'
  // Advanced computed
  | 'auto_number' | 'barcode' | 'progress' | 'status';

export type RelationType = 'one_to_one' | 'one_to_many' | 'many_to_many';

export type AggregationTypeEnhanced = 
  | 'count' | 'count_empty' | 'count_not_empty' | 'count_unique'
  | 'sum' | 'average' | 'median' | 'min' | 'max' | 'range'
  | 'earliest' | 'latest' | 'percent_empty' | 'percent_not_empty';

export type FilterOperatorEnhanced = 
  | 'equals' | 'not_equals' | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty'
  | 'greater_than' | 'greater_than_or_equal' | 'less_than' | 'less_than_or_equal'
  | 'between' | 'is_within' | 'is_before' | 'is_after'
  | 'in' | 'not_in' | 'matches_regex' | 'has_any' | 'has_all';

export type ViewTypeEnhanced = 'table' | 'gallery' | 'kanban' | 'calendar' | 'timeline' | 'chart' | 'form';

export type SortDirection = 'asc' | 'desc';
export type RowHeight = 'compact' | 'normal' | 'comfortable' | 'tall';

// Enhanced database block with template support
export interface DatabaseBlockEnhanced {
  id: string;
  blockId: string;
  name: string;
  description?: string;
  icon?: string;
  coverImage?: string;
  
  // Schema and structure
  schema: DatabaseColumnEnhanced[];
  relations: DatabaseRelation[];
  views: DatabaseViewEnhanced[];
  defaultViewId?: string;
  
  // Performance and settings
  settings: DatabaseSettingsEnhanced;
  rowCount: number;
  lastAggregationUpdate: string;
  
  // Template support
  isTemplate: boolean;
  templateCategory?: string;
  parentTemplateId?: string;
  
  // Versioning
  version: number;
  schemaVersion: number;
  
  // Timestamps and audit
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// Enhanced column definition with advanced features
export interface DatabaseColumnEnhanced {
  id: string;
  databaseBlockId: string;
  columnId: string;
  name: string;
  description?: string;
  type: DatabaseColumnTypeEnhanced;
  
  // Position and display
  position: number;
  width: number;
  isPrimary?: boolean;
  isRequired?: boolean;
  isUnique?: boolean;
  isHidden?: boolean;
  isLocked?: boolean;
  isFrozen?: boolean;
  
  // Default values and validation
  defaultValue?: any;
  validation?: ValidationRuleEnhanced[];
  
  // Type-specific configuration
  config: ColumnConfigEnhanced;
  
  // Computed column settings
  formula?: FormulaConfig;
  rollup?: RollupConfig;
  lookup?: LookupConfig;
  
  // Display and formatting
  format?: ColumnFormat;
  aggregation?: AggregationTypeEnhanced;
  
  // Permissions
  permissions?: ColumnPermissions;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// Comprehensive column configuration
export interface ColumnConfigEnhanced {
  // Select/Multi-select options
  options?: SelectOptionEnhanced[];
  allowMultiple?: boolean;
  
  // Number formatting
  precision?: number;
  prefix?: string;
  suffix?: string;
  useThousandsSeparator?: boolean;
  
  // Date/Time formatting
  dateFormat?: string;
  timeFormat?: string;
  includeTime?: boolean;
  timezone?: string;
  
  // Currency settings
  currency?: string;
  currencyPosition?: 'before' | 'after';
  
  // Rating settings
  maxRating?: number;
  icon?: string;
  color?: string;
  
  // Text settings
  maxLength?: number;
  minLength?: number;
  allowEmpty?: boolean;
  multiline?: boolean;
  
  // File settings
  acceptedTypes?: string[];
  maxSize?: number;
  maxFiles?: number;
  
  // People/User settings
  allowMultipleUsers?: boolean;
  restrictToWorkspace?: boolean;
  
  // Progress settings
  progressType?: 'percentage' | 'fraction' | 'number';
  maxValue?: number;
  
  // Relation settings
  relationId?: string;
  displayProperty?: string;
  
  // Formula settings
  expression?: string;
  dependencies?: string[];
  
  // Barcode settings
  barcodeType?: string;
  includeText?: boolean;
}

export interface SelectOptionEnhanced {
  id: string;
  value: string;
  label: string;
  color?: string;
  icon?: string;
  description?: string;
  order: number;
}

export interface ValidationRuleEnhanced {
  id: string;
  type: 'min' | 'max' | 'regex' | 'required' | 'unique' | 'custom' | 'range' | 'length';
  value?: any;
  value2?: any; // For range validations
  message?: string;
  enabled: boolean;
}

// Formula configuration
export interface FormulaConfig {
  expression: string;
  dependencies: string[];
  returnType: DatabaseColumnTypeEnhanced;
  lastUpdated: string;
  error?: string;
}

// Rollup configuration
export interface RollupConfig {
  relationId: string;
  targetProperty: string;
  aggregation: AggregationTypeEnhanced;
  filters?: FilterEnhanced[];
}

// Lookup configuration
export interface LookupConfig {
  relationId: string;
  targetProperty: string;
  fallbackValue?: any;
}

// Column formatting
export interface ColumnFormat {
  type: 'default' | 'custom';
  template?: string;
  conditionalFormatting?: ConditionalFormat[];
}

export interface ConditionalFormat {
  id: string;
  condition: FilterEnhanced;
  style: {
    backgroundColor?: string;
    textColor?: string;
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';
  };
}

// Column permissions
export interface ColumnPermissions {
  read: string[]; // User IDs or role names
  write: string[];
  admin: string[];
}

// Enhanced database relations
export interface DatabaseRelation {
  id: string;
  sourceDbBlockId: string;
  targetDbBlockId: string;
  relationName: string;
  relationType: RelationType;
  settings: RelationSettings;
  createdAt: string;
}

export interface RelationSettings {
  sourceProperty: string;
  targetProperty: string;
  cascadeDelete?: boolean;
  allowDuplicates?: boolean;
  sortOrder?: SortConfig[];
}

// Enhanced database rows with computed values
export interface DatabaseRowEnhanced {
  id: string;
  databaseBlockId: string;
  
  // Core data
  data: Record<string, any>;
  computedData: Record<string, any>; // Cached computed values
  
  // Position and metadata
  position: number;
  autoNumber?: number;
  metadata: RowMetadataEnhanced;
  tags: string[];
  
  // Version control
  version: number;
  
  // Audit trail
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  
  // Soft delete
  deletedAt?: string;
  deletedBy?: string;
}

export interface RowMetadataEnhanced {
  color?: string;
  icon?: string;
  attachments?: string[];
  customFields?: Record<string, any>;
  lastEditedBy?: string;
  editCount?: number;
  commentCount?: number;
}

// Enhanced database views with advanced features
export interface DatabaseViewEnhanced {
  id: string;
  databaseBlockId: string;
  name: string;
  description?: string;
  type: ViewTypeEnhanced;
  
  // View configuration
  filters: FilterEnhanced[];
  sorts: SortConfig[];
  groupBy?: GroupByConfig;
  
  // Column visibility and order
  visibleColumns: string[];
  columnOrder: string[];
  frozenColumns: number;
  
  // Display settings
  settings: ViewSettings;
  
  // Permissions
  isPublic: boolean;
  permissions?: ViewPermissions;
  
  // Metadata
  isDefault: boolean;
  isTemplate: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// Enhanced filtering with complex conditions
export interface FilterEnhanced {
  id: string;
  columnId: string;
  operator: FilterOperatorEnhanced;
  value: any;
  value2?: any; // For between operations
  conjunction?: 'and' | 'or';
  group?: string; // For grouping filters
  enabled: boolean;
}

export interface SortConfig {
  columnId: string;
  direction: SortDirection;
  priority: number;
  nullsLast?: boolean;
}

export interface GroupByConfig {
  columnId: string;
  order: SortDirection;
  showGroupTotals: boolean;
  aggregations: Record<string, AggregationTypeEnhanced>;
}

// View-specific settings
export interface ViewSettings {
  // Table view
  rowHeight?: RowHeight;
  showRowNumbers?: boolean;
  showGroupHeaders?: boolean;
  alternateRowColors?: boolean;
  
  // Gallery view
  cardSize?: 'small' | 'medium' | 'large';
  coverField?: string;
  
  // Kanban view
  groupByField?: string;
  swimlaneField?: string;
  
  // Calendar view
  dateField?: string;
  endDateField?: string;
  colorField?: string;
  
  // Chart view
  chartType?: 'bar' | 'line' | 'pie' | 'scatter';
  xAxis?: string;
  yAxis?: string[];
  
  // Timeline view
  startDateField?: string;
  endDateField?: string;
  labelField?: string;
}

export interface ViewPermissions {
  read: string[];
  write: string[];
  admin: string[];
  share: string[];
}

// Enhanced database settings
export interface DatabaseSettingsEnhanced {
  // Display
  rowHeight: RowHeight;
  showRowNumbers: boolean;
  showGridLines: boolean;
  alternateRowColors: boolean;
  wrapText: boolean;
  frozenColumns: number;
  
  // Functionality
  allowInlineEdit: boolean;
  allowRowSelection: boolean;
  allowMultiSelect: boolean;
  allowComments: boolean;
  allowHistory: boolean;
  
  // Import/Export
  allowExport: boolean;
  allowImport: boolean;
  exportFormats: string[];
  
  // Performance
  cacheAggregations: boolean;
  partitionThreshold: number;
  virtualScrolling: boolean;
  lazyLoading: boolean;
  
  // Collaboration
  enableRealtime: boolean;
  enablePresence: boolean;
  enableNotifications: boolean;
  
  // Advanced
  customJS?: string;
  customCSS?: string;
  webhooks?: WebhookConfig[];
}

export interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  enabled: boolean;
}

// Activity and comments
export interface DatabaseActivity {
  id: string;
  databaseBlockId: string;
  rowId?: string;
  userId: string;
  action: 'created' | 'updated' | 'deleted' | 'commented' | 'imported' | 'exported' | 'restored';
  columnId?: string;
  oldValue?: any;
  newValue?: any;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface DatabaseRowComment {
  id: string;
  rowId: string;
  databaseBlockId: string;
  userId: string;
  content: string;
  metadata: Record<string, any>;
  mentions: string[];
  threadId?: string;
  isResolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// API request/response types
export interface GetDatabaseRowsRequestEnhanced {
  databaseBlockId: string;
  viewId?: string;
  limit?: number;
  offset?: number;
  filters?: FilterEnhanced[];
  sorts?: SortConfig[];
  search?: string;
  includeComputedData?: boolean;
  includeMetadata?: boolean;
}

export interface GetDatabaseRowsResponseEnhanced {
  rows: DatabaseRowEnhanced[];
  totalCount: number;
  hasMore: boolean;
  aggregations?: Record<string, any>;
  cachedAt?: string;
}

export interface BulkUpdateRowsRequestEnhanced {
  databaseBlockId: string;
  updates: Array<{
    id: string;
    data?: Record<string, any>;
    metadata?: RowMetadataEnhanced;
    version: number;
  }>;
  invalidateCache?: boolean;
}

export interface ImportDataRequestEnhanced {
  databaseBlockId: string;
  format: 'csv' | 'excel' | 'json' | 'tsv';
  data: string | ArrayBuffer;
  options: {
    skipFirstRow?: boolean;
    updateExisting?: boolean;
    keyColumn?: string;
    mappings?: Record<string, string>;
    createNewColumns?: boolean;
    dateFormat?: string;
    encoding?: string;
  };
}

export interface ExportDataRequestEnhanced {
  databaseBlockId: string;
  viewId?: string;
  format: 'csv' | 'excel' | 'json' | 'pdf' | 'xml';
  filters?: FilterEnhanced[];
  sorts?: SortConfig[];
  columns?: string[];
  includeComputedData?: boolean;
  includeMetadata?: boolean;
  options?: {
    includeHeaders?: boolean;
    dateFormat?: string;
    numberFormat?: string;
  };
}

// Performance monitoring
export interface DatabasePerformanceMetrics {
  databaseBlockId: string;
  rowCount: number;
  avgQueryTime: number;
  cacheHitRate: number;
  indexUsage: Record<string, number>;
  activeConnections: number;
  lastOptimized: string;
}

// Template system
export interface DatabaseTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  tags: string[];
  schema: DatabaseColumnEnhanced[];
  views: DatabaseViewEnhanced[];
  sampleData?: DatabaseRowEnhanced[];
  settings: DatabaseSettingsEnhanced;
  usageCount: number;
  rating: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Formula evaluation context
export interface FormulaContext {
  row: DatabaseRowEnhanced;
  allRows: DatabaseRowEnhanced[];
  columns: DatabaseColumnEnhanced[];
  relations: Record<string, DatabaseRowEnhanced[]>;
  aggregations: Record<string, any>;
  functions: Record<string, Function>;
}

// Validation helpers
export class ColumnValidatorEnhanced {
  static validateValue(
    column: DatabaseColumnEnhanced, 
    value: any, 
    context?: FormulaContext
  ): { valid: boolean; error?: string; warnings?: string[] } {
    const warnings: string[] = [];
    
    // Check required
    if (column.isRequired && this.isEmpty(value)) {
      return { valid: false, error: `${column.name} is required` };
    }

    // Type-specific validation
    const typeValidation = this.validateByType(column, value);
    if (!typeValidation.valid) {
      return typeValidation;
    }

    // Custom validation rules
    if (column.validation) {
      for (const rule of column.validation.filter(r => r.enabled)) {
        const result = this.applyValidationRule(rule, value, column);
        if (!result.valid) {
          return result;
        }
        if (result.warnings) {
          warnings.push(...result.warnings);
        }
      }
    }

    return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  private static isEmpty(value: any): boolean {
    return value === null || value === undefined || value === '' || 
           (Array.isArray(value) && value.length === 0);
  }

  private static validateByType(
    column: DatabaseColumnEnhanced, 
    value: any
  ): { valid: boolean; error?: string } {
    if (this.isEmpty(value)) return { valid: true };

    switch (column.type) {
      case 'number':
      case 'currency':
      case 'percent':
        if (isNaN(Number(value))) {
          return { valid: false, error: `${column.name} must be a number` };
        }
        break;

      case 'email':
        if (!this.isValidEmail(value)) {
          return { valid: false, error: `${column.name} must be a valid email` };
        }
        break;

      case 'url':
        if (!this.isValidUrl(value)) {
          return { valid: false, error: `${column.name} must be a valid URL` };
        }
        break;

      case 'phone':
        if (!this.isValidPhone(value)) {
          return { valid: false, error: `${column.name} must be a valid phone number` };
        }
        break;

      case 'date':
      case 'datetime':
        if (!this.isValidDate(value)) {
          return { valid: false, error: `${column.name} must be a valid date` };
        }
        break;

      case 'select':
        if (column.config.options) {
          const validValues = column.config.options.map(o => o.value);
          if (!validValues.includes(value)) {
            return { valid: false, error: `Invalid value for ${column.name}` };
          }
        }
        break;

      case 'multi_select':
        if (column.config.options && Array.isArray(value)) {
          const validValues = column.config.options.map(o => o.value);
          for (const v of value) {
            if (!validValues.includes(v)) {
              return { valid: false, error: `Invalid value for ${column.name}` };
            }
          }
        }
        break;

      case 'rating':
        const max = column.config.maxRating || 5;
        if (value < 0 || value > max) {
          return { valid: false, error: `${column.name} must be between 0 and ${max}` };
        }
        break;

      case 'checkbox':
        if (typeof value !== 'boolean') {
          return { valid: false, error: `${column.name} must be true or false` };
        }
        break;

      case 'rich_text':
        if (typeof value !== 'string' && typeof value !== 'object') {
          return { valid: false, error: `${column.name} must be valid rich text` };
        }
        break;
    }

    return { valid: true };
  }

  private static applyValidationRule(
    rule: ValidationRuleEnhanced, 
    value: any, 
    column: DatabaseColumnEnhanced
  ): { valid: boolean; error?: string; warnings?: string[] } {
    switch (rule.type) {
      case 'min':
        if (typeof value === 'number' && value < rule.value) {
          return { valid: false, error: rule.message || `Value must be at least ${rule.value}` };
        }
        if (typeof value === 'string' && value.length < rule.value) {
          return { valid: false, error: rule.message || `Must be at least ${rule.value} characters` };
        }
        break;

      case 'max':
        if (typeof value === 'number' && value > rule.value) {
          return { valid: false, error: rule.message || `Value must be at most ${rule.value}` };
        }
        if (typeof value === 'string' && value.length > rule.value) {
          return { valid: false, error: rule.message || `Must be at most ${rule.value} characters` };
        }
        break;

      case 'range':
        if (typeof value === 'number' && (value < rule.value || value > rule.value2)) {
          return { valid: false, error: rule.message || `Value must be between ${rule.value} and ${rule.value2}` };
        }
        break;

      case 'regex':
        if (typeof value === 'string') {
          const regex = new RegExp(rule.value);
          if (!regex.test(value)) {
            return { valid: false, error: rule.message || 'Invalid format' };
          }
        }
        break;

      case 'unique':
        // This needs to be checked server-side against the database
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
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }

  private static isValidDate(date: any): boolean {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }
}