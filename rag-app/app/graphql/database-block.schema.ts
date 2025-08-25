// GraphQL Schema for Database Blocks
// Provides flexible querying capabilities for complex data relationships

import { gql } from 'graphql-tag';

export const databaseBlockSchema = gql`
  # Enums
  enum DatabaseColumnType {
    TEXT
    NUMBER
    DATE
    DATETIME
    CHECKBOX
    URL
    EMAIL
    PHONE
    SELECT
    MULTI_SELECT
    CURRENCY
    PERCENT
    RATING
    RICH_TEXT
    RELATION
    ROLLUP
    LOOKUP
    PEOPLE
    FILES
    FORMULA
    COUNT
    CREATED_TIME
    UPDATED_TIME
    CREATED_BY
    UPDATED_BY
    AUTO_NUMBER
    BARCODE
    PROGRESS
    STATUS
  }

  enum FilterOperator {
    EQUALS
    NOT_EQUALS
    CONTAINS
    NOT_CONTAINS
    STARTS_WITH
    ENDS_WITH
    IS_EMPTY
    IS_NOT_EMPTY
    GREATER_THAN
    GREATER_THAN_OR_EQUAL
    LESS_THAN
    LESS_THAN_OR_EQUAL
    BETWEEN
    IS_WITHIN
    IS_BEFORE
    IS_AFTER
    IN
    NOT_IN
    MATCHES_REGEX
    HAS_ANY
    HAS_ALL
  }

  enum SortDirection {
    ASC
    DESC
  }

  enum AggregationType {
    COUNT
    COUNT_EMPTY
    COUNT_NOT_EMPTY
    COUNT_UNIQUE
    SUM
    AVERAGE
    MEDIAN
    MIN
    MAX
    RANGE
    EARLIEST
    LATEST
    PERCENT_EMPTY
    PERCENT_NOT_EMPTY
  }

  enum ViewType {
    TABLE
    GALLERY
    KANBAN
    CALENDAR
    TIMELINE
    CHART
    FORM
  }

  enum RowHeight {
    COMPACT
    NORMAL
    COMFORTABLE
    TALL
  }

  # Input Types
  input FilterInput {
    id: String!
    columnId: String!
    operator: FilterOperator!
    value: JSON
    value2: JSON
    conjunction: String
    group: String
    enabled: Boolean!
  }

  input SortInput {
    columnId: String!
    direction: SortDirection!
    priority: Int!
    nullsLast: Boolean
  }

  input SelectOptionInput {
    id: String!
    value: String!
    label: String!
    color: String
    icon: String
    description: String
    order: Int!
  }

  input ValidationRuleInput {
    id: String!
    type: String!
    value: JSON
    value2: JSON
    message: String
    enabled: Boolean!
  }

  input ColumnConfigInput {
    options: [SelectOptionInput!]
    allowMultiple: Boolean
    precision: Int
    prefix: String
    suffix: String
    useThousandsSeparator: Boolean
    dateFormat: String
    timeFormat: String
    includeTime: Boolean
    timezone: String
    currency: String
    currencyPosition: String
    maxRating: Int
    icon: String
    color: String
    maxLength: Int
    minLength: Int
    allowEmpty: Boolean
    multiline: Boolean
    acceptedTypes: [String!]
    maxSize: Int
    maxFiles: Int
    allowMultipleUsers: Boolean
    restrictToWorkspace: Boolean
    progressType: String
    maxValue: Int
    relationId: String
    displayProperty: String
    expression: String
    dependencies: [String!]
    barcodeType: String
    includeText: Boolean
  }

  input DatabaseColumnInput {
    id: String
    columnId: String!
    name: String!
    description: String
    type: DatabaseColumnType!
    position: Int!
    width: Int!
    isPrimary: Boolean
    isRequired: Boolean
    isUnique: Boolean
    isHidden: Boolean
    isLocked: Boolean
    isFrozen: Boolean
    defaultValue: JSON
    validation: [ValidationRuleInput!]
    config: ColumnConfigInput!
  }

  input DatabaseViewInput {
    id: String
    name: String!
    description: String
    type: ViewType!
    filters: [FilterInput!]!
    sorts: [SortInput!]!
    visibleColumns: [String!]!
    columnOrder: [String!]!
    frozenColumns: Int!
    settings: JSON
    isPublic: Boolean!
    isDefault: Boolean!
  }

  input GetRowsInput {
    databaseBlockId: String!
    viewId: String
    limit: Int
    offset: Int
    filters: [FilterInput!]
    sorts: [SortInput!]
    search: String
    includeComputedData: Boolean
    includeMetadata: Boolean
  }

  input CreateRowInput {
    databaseBlockId: String!
    data: JSON!
  }

  input UpdateRowInput {
    id: String!
    data: JSON!
    version: Int!
  }

  input BulkUpdateInput {
    databaseBlockId: String!
    updates: [UpdateRowInput!]!
    invalidateCache: Boolean
  }

  # Object Types
  type SelectOption {
    id: String!
    value: String!
    label: String!
    color: String
    icon: String
    description: String
    order: Int!
  }

  type ValidationRule {
    id: String!
    type: String!
    value: JSON
    value2: JSON
    message: String
    enabled: Boolean!
  }

  type ColumnConfig {
    options: [SelectOption!]
    allowMultiple: Boolean
    precision: Int
    prefix: String
    suffix: String
    useThousandsSeparator: Boolean
    dateFormat: String
    timeFormat: String
    includeTime: Boolean
    timezone: String
    currency: String
    currencyPosition: String
    maxRating: Int
    icon: String
    color: String
    maxLength: Int
    minLength: Int
    allowEmpty: Boolean
    multiline: Boolean
    acceptedTypes: [String!]
    maxSize: Int
    maxFiles: Int
    allowMultipleUsers: Boolean
    restrictToWorkspace: Boolean
    progressType: String
    maxValue: Int
    relationId: String
    displayProperty: String
    expression: String
    dependencies: [String!]
    barcodeType: String
    includeText: Boolean
  }

  type FormulaConfig {
    expression: String!
    dependencies: [String!]!
    returnType: DatabaseColumnType!
    lastUpdated: String!
    error: String
  }

  type DatabaseColumn {
    id: String!
    databaseBlockId: String!
    columnId: String!
    name: String!
    description: String
    type: DatabaseColumnType!
    position: Int!
    width: Int!
    isPrimary: Boolean
    isRequired: Boolean
    isUnique: Boolean
    isHidden: Boolean
    isLocked: Boolean
    isFrozen: Boolean
    defaultValue: JSON
    validation: [ValidationRule!]
    config: ColumnConfig!
    formula: FormulaConfig
    aggregation: AggregationType
    createdAt: String!
    updatedAt: String!
  }

  type DatabaseView {
    id: String!
    databaseBlockId: String!
    name: String!
    description: String
    type: ViewType!
    filters: [Filter!]!
    sorts: [Sort!]!
    visibleColumns: [String!]!
    columnOrder: [String!]!
    frozenColumns: Int!
    settings: JSON
    isPublic: Boolean!
    isDefault: Boolean!
    isTemplate: Boolean!
    createdBy: String
    createdAt: String!
    updatedAt: String!
  }

  type Filter {
    id: String!
    columnId: String!
    operator: FilterOperator!
    value: JSON
    value2: JSON
    conjunction: String
    group: String
    enabled: Boolean!
  }

  type Sort {
    columnId: String!
    direction: SortDirection!
    priority: Int!
    nullsLast: Boolean
  }

  type DatabaseSettings {
    rowHeight: RowHeight!
    showRowNumbers: Boolean!
    showGridLines: Boolean!
    alternateRowColors: Boolean!
    wrapText: Boolean!
    frozenColumns: Int!
    allowInlineEdit: Boolean!
    allowRowSelection: Boolean!
    allowMultiSelect: Boolean!
    allowComments: Boolean!
    allowHistory: Boolean!
    allowExport: Boolean!
    allowImport: Boolean!
    exportFormats: [String!]!
    cacheAggregations: Boolean!
    partitionThreshold: Int!
    virtualScrolling: Boolean!
    lazyLoading: Boolean!
    enableRealtime: Boolean!
    enablePresence: Boolean!
    enableNotifications: Boolean!
    customJS: String
    customCSS: String
  }

  type DatabaseBlock {
    id: String!
    blockId: String!
    name: String!
    description: String
    icon: String
    coverImage: String
    schema: [DatabaseColumn!]!
    views: [DatabaseView!]!
    defaultViewId: String
    settings: DatabaseSettings!
    rowCount: Int!
    lastAggregationUpdate: String!
    isTemplate: Boolean!
    templateCategory: String
    parentTemplateId: String
    version: Int!
    schemaVersion: Int!
    createdAt: String!
    updatedAt: String!
    createdBy: String
    updatedBy: String
    
    # Computed fields
    rows(
      viewId: String
      limit: Int = 50
      offset: Int = 0
      filters: [FilterInput!]
      sorts: [SortInput!]
      search: String
      includeComputedData: Boolean = true
      includeMetadata: Boolean = false
    ): DatabaseRowConnection!
    
    aggregation(
      columnId: String!
      type: AggregationType!
      filters: [FilterInput!]
    ): JSON
    
    performanceMetrics: DatabasePerformanceMetrics!
  }

  type DatabaseRow {
    id: String!
    databaseBlockId: String!
    data: JSON!
    computedData: JSON!
    position: Int!
    autoNumber: Int
    metadata: JSON!
    tags: [String!]!
    version: Int!
    createdAt: String!
    updatedAt: String!
    createdBy: String
    updatedBy: String
    deletedAt: String
    deletedBy: String
    
    # Computed fields
    comments: [DatabaseRowComment!]!
    history: [DatabaseActivity!]!
    relatedRows(relationId: String!): [DatabaseRow!]!
  }

  type DatabaseRowConnection {
    edges: [DatabaseRowEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
    aggregations: JSON
    cachedAt: String
  }

  type DatabaseRowEdge {
    node: DatabaseRow!
    cursor: String!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type DatabaseRowComment {
    id: String!
    rowId: String!
    databaseBlockId: String!
    userId: String!
    content: String!
    metadata: JSON!
    mentions: [String!]!
    threadId: String
    isResolved: Boolean!
    resolvedBy: String
    resolvedAt: String
    createdAt: String!
    updatedAt: String!
  }

  type DatabaseActivity {
    id: String!
    databaseBlockId: String!
    rowId: String
    userId: String!
    action: String!
    columnId: String
    oldValue: JSON
    newValue: JSON
    metadata: JSON!
    createdAt: String!
  }

  type DatabasePerformanceMetrics {
    databaseBlockId: String!
    rowCount: Int!
    avgQueryTime: Float!
    cacheHitRate: Float!
    indexUsage: JSON!
    activeConnections: Int!
    lastOptimized: String!
  }

  type BulkUpdateResult {
    updated: Int!
    errors: [String!]!
  }

  type FormulaResult {
    value: JSON
    type: String!
    error: String
    dependencies: [String!]
    computedAt: String!
  }

  # Queries
  type Query {
    # Database Block queries
    databaseBlock(id: String, blockId: String): DatabaseBlock
    databaseBlocks(
      workspaceId: String!
      limit: Int = 20
      offset: Int = 0
      search: String
      templateCategory: String
    ): [DatabaseBlock!]!
    
    # Database templates
    databaseTemplates(
      category: String
      limit: Int = 20
      offset: Int = 0
    ): [DatabaseBlock!]!
    
    # Row queries
    databaseRow(id: String!): DatabaseRow
    databaseRows(input: GetRowsInput!): DatabaseRowConnection!
    
    # Aggregation queries
    databaseAggregation(
      databaseBlockId: String!
      columnId: String!
      type: AggregationType!
      filters: [FilterInput!]
    ): JSON
    
    # Performance queries
    databasePerformanceMetrics(databaseBlockId: String!): DatabasePerformanceMetrics!
    
    # Formula queries
    evaluateFormula(
      expression: String!
      rowId: String!
      databaseBlockId: String!
    ): FormulaResult!
    
    # Search queries
    searchDatabaseBlocks(
      query: String!
      workspaceId: String!
      limit: Int = 10
    ): [DatabaseBlock!]!
    
    searchDatabaseRows(
      query: String!
      databaseBlockId: String!
      columns: [String!]
      limit: Int = 50
    ): [DatabaseRow!]!
  }

  # Mutations
  type Mutation {
    # Database Block mutations
    createDatabaseBlock(
      blockId: String!
      name: String!
      description: String
      templateId: String
    ): DatabaseBlock!
    
    updateDatabaseBlock(
      id: String!
      name: String
      description: String
      schema: [DatabaseColumnInput!]
      views: [DatabaseViewInput!]
      settings: JSON
    ): DatabaseBlock!
    
    deleteDatabaseBlock(id: String!): Boolean!
    
    duplicateDatabaseBlock(
      id: String!
      newName: String!
      copyData: Boolean = false
    ): DatabaseBlock!
    
    # Column mutations
    addColumn(
      databaseBlockId: String!
      column: DatabaseColumnInput!
    ): DatabaseColumn!
    
    updateColumn(
      databaseBlockId: String!
      columnId: String!
      updates: DatabaseColumnInput!
    ): DatabaseColumn!
    
    deleteColumn(
      databaseBlockId: String!
      columnId: String!
    ): Boolean!
    
    reorderColumns(
      databaseBlockId: String!
      columnOrder: [String!]!
    ): Boolean!
    
    # View mutations
    createView(
      databaseBlockId: String!
      view: DatabaseViewInput!
    ): DatabaseView!
    
    updateView(
      id: String!
      updates: DatabaseViewInput!
    ): DatabaseView!
    
    deleteView(id: String!): Boolean!
    
    # Row mutations
    createRow(input: CreateRowInput!): DatabaseRow!
    
    updateRow(input: UpdateRowInput!): DatabaseRow!
    
    deleteRow(id: String!): Boolean!
    
    deleteRows(ids: [String!]!): Int!
    
    duplicateRow(id: String!): DatabaseRow!
    
    bulkUpdateRows(input: BulkUpdateInput!): BulkUpdateResult!
    
    # Batch operations
    importData(
      databaseBlockId: String!
      format: String!
      data: String!
      options: JSON
    ): BulkUpdateResult!
    
    exportData(
      databaseBlockId: String!
      format: String!
      viewId: String
      filters: [FilterInput!]
      columns: [String!]
      options: JSON
    ): String! # Returns download URL or data
    
    # Comments
    addComment(
      rowId: String!
      content: String!
      mentions: [String!]
    ): DatabaseRowComment!
    
    updateComment(
      id: String!
      content: String!
    ): DatabaseRowComment!
    
    deleteComment(id: String!): Boolean!
    
    resolveComment(id: String!): DatabaseRowComment!
    
    # Cache management
    invalidateCache(databaseBlockId: String!): Boolean!
    
    refreshAggregations(databaseBlockId: String!): Boolean!
  }

  # Subscriptions for real-time updates
  type Subscription {
    # Database block changes
    databaseBlockUpdated(blockId: String!): DatabaseBlock!
    
    # Row changes
    rowCreated(databaseBlockId: String!): DatabaseRow!
    rowUpdated(databaseBlockId: String!): DatabaseRow!
    rowDeleted(databaseBlockId: String!): String! # Returns deleted row ID
    
    # Comment changes
    commentAdded(rowId: String!): DatabaseRowComment!
    commentUpdated(rowId: String!): DatabaseRowComment!
    commentDeleted(rowId: String!): String! # Returns deleted comment ID
    
    # Presence updates
    userPresence(databaseBlockId: String!): JSON!
    
    # Activity feed
    activityFeed(databaseBlockId: String!): DatabaseActivity!
  }

  # Custom scalar for JSON data
  scalar JSON
`;

export default databaseBlockSchema;