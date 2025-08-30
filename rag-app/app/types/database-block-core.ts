// Core Database Block Type Definitions
// Foundation types for the high-performance database block implementation

// ============= Column Types =============

export type DatabaseColumnType = 
  | 'text'
  | 'number'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'select'
  | 'multi_select'
  | 'currency'
  | 'percent'
  | 'rating'
  | 'rich_text'
  | 'relation'
  | 'rollup'
  | 'lookup'
  | 'people'
  | 'files'
  | 'formula'
  | 'count'
  | 'created_time'
  | 'updated_time'
  | 'created_by'
  | 'updated_by'
  | 'auto_number'
  | 'barcode'
  | 'progress'
  | 'status';

// ============= Core Interfaces =============

export interface DatabaseColumnCore {
  id: string;
  name: string;
  type: DatabaseColumnType;
  description?: string;
  width?: number;
  isRequired?: boolean;
  isUnique?: boolean;
  isHidden?: boolean;
  isPrimary?: boolean;
  defaultValue?: any;
  
  // Type-specific options
  options?: SelectOption[]; // For select/multi_select
  formula?: FormulaConfig; // For formula columns
  relation?: RelationConfig; // For relation columns
  rollup?: RollupConfig; // For rollup columns
  format?: FormatConfig; // For number/currency/percent
}

export interface SelectOption {
  id: string;
  label: string;
  color?: string;
}

export interface FormulaConfig {
  expression: string;
  resultType: DatabaseColumnType;
  dependencies?: string[]; // Column IDs this formula depends on
}

export interface RelationConfig {
  targetDatabaseId: string;
  targetColumnId: string;
  relationType: 'one_to_one' | 'one_to_many' | 'many_to_many';
  inverseRelationId?: string;
}

export interface RollupConfig {
  relationColumnId: string;
  targetColumnId: string;
  aggregationType: AggregationType;
}

export interface FormatConfig {
  prefix?: string;
  suffix?: string;
  decimals?: number;
  thousandsSeparator?: boolean;
}

export type AggregationType = 
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'median'
  | 'std_dev'
  | 'unique'
  | 'empty'
  | 'not_empty'
  | 'percent_empty'
  | 'percent_not_empty';

// ============= Database Block =============

export interface DatabaseBlockCore {
  id: string;
  blockId: string;
  name: string;
  description?: string;
  icon?: string;
  coverImage?: string;
  
  schema: DatabaseColumnCore[];
  views?: DatabaseViewCore[];
  defaultViewId?: string;
  
  settings: DatabaseBlockSettings;
  
  rowCount: number;
  lastAggregationUpdate?: string;
  
  version?: number;
  schemaVersion?: number;
  
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface DatabaseBlockSettings {
  rowHeight: 'compact' | 'normal' | 'tall';
  showRowNumbers: boolean;
  frozenColumns: number;
  enableComments?: boolean;
  enableHistory?: boolean;
  enableFormulas?: boolean;
  virtualScrolling?: boolean;
  cacheAggregations?: boolean;
  partitionThreshold?: number;
}

// ============= Views =============

export interface DatabaseViewCore {
  id: string;
  name: string;
  type: ViewType;
  icon?: string;
  
  visibleColumns?: string[];
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  
  filters: FilterCondition[];
  sorts: SortConfig[];
  groups?: GroupConfig[];
  
  settings: ViewSettings;
  
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export type ViewType = 
  | 'table'
  | 'kanban'
  | 'calendar'
  | 'gallery'
  | 'timeline'
  | 'list'
  | 'board'
  | 'chart';

export interface ViewSettings {
  rowsPerPage?: number;
  hideEmptyGroups?: boolean;
  collapseGroups?: boolean;
  showAggregations?: boolean;
  // View-specific settings
  kanban?: {
    columnProperty: string;
    coverProperty?: string;
    cardSize: 'small' | 'medium' | 'large';
  };
  calendar?: {
    dateProperty: string;
    startOfWeek: 'sunday' | 'monday';
  };
  gallery?: {
    coverProperty: string;
    aspectRatio: '1:1' | '4:3' | '16:9';
    cardsPerRow: number;
  };
}

// ============= Filters & Sorting =============

export interface FilterCondition {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value?: any;
  conjunction?: 'and' | 'or';
}

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
  | 'is_within';

export interface SortConfig {
  columnId: string;
  direction: 'asc' | 'desc';
  priority: number;
  nullsLast?: boolean;
}

export interface GroupConfig {
  columnId: string;
  collapsed?: string[]; // Group values that are collapsed
  sortDirection?: 'asc' | 'desc';
}

// ============= Rows =============

export interface DatabaseRowCore {
  id: string;
  data: Record<string, any>;
  computedData?: Record<string, any>;
  position?: number;
  version: number;
  
  metadata?: Record<string, any>;
  tags?: string[];
  
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  
  deletedAt?: string;
  deletedBy?: string;
}

// ============= API Inputs =============

export interface CreateDatabaseBlockInput {
  blockId: string;
  name?: string;
  description?: string;
  schema?: DatabaseColumnCore[];
  settings?: Partial<DatabaseBlockSettings>;
  userId?: string;
}

export interface UpdateDatabaseBlockInput {
  name?: string;
  description?: string;
  icon?: string;
  coverImage?: string;
  schema?: DatabaseColumnCore[];
  settings?: Partial<DatabaseBlockSettings>;
  defaultViewId?: string;
}

export interface CreateRowInput {
  data?: Record<string, any>;
  position?: number;
  userId?: string;
}

export interface UpdateRowInput {
  data: Record<string, any>;
  version?: number;
  userId?: string;
}

export interface BulkUpdateRowsInput {
  rowIds: string[];
  updates: Record<string, any>;
  userId?: string;
}

// ============= Performance Types =============

export interface DatabasePerformanceMetrics {
  databaseBlockId: string;
  rowCount: number;
  avgQueryTime: number;
  cacheHitRate: number;
  indexUsage: Record<string, number>;
  activeConnections: number;
  lastOptimized: string;
}

export interface QueryMetrics {
  query: string;
  duration: number;
  rowsReturned: number;
  cacheHit: boolean;
  timestamp: string;
}

// ============= Real-time Collaboration =============

export interface PresenceState {
  userId: string;
  userName?: string;
  color: string;
  cursor?: {
    rowId: string;
    columnId: string;
  };
  selection?: {
    rowIds: string[];
    columnIds: string[];
  };
  lastSeen: string;
}

export interface CellEdit {
  rowId: string;
  columnId: string;
  userId: string;
  userName?: string;
  timestamp: string;
}

// ============= Export/Import =============

export interface ExportOptions {
  format: 'csv' | 'json' | 'excel';
  includeHeaders?: boolean;
  includeComputedColumns?: boolean;
  includeDeletedRows?: boolean;
  columns?: string[];
}

export interface ImportOptions {
  format: 'csv' | 'json' | 'excel';
  hasHeaders?: boolean;
  columnMapping?: Record<string, string>;
  skipDuplicates?: boolean;
  updateExisting?: boolean;
}