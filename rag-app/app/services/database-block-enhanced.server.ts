// Enhanced Database Block Service with High Performance Features
// Designed to handle 50,000+ records efficiently

import { createSupabaseAdmin } from '~/utils/supabase.server';
import Redis from 'ioredis';
import type { 
  DatabaseBlockEnhanced,
  DatabaseColumnEnhanced,
  DatabaseRowEnhanced,
  DatabaseViewEnhanced,
  GetDatabaseRowsRequestEnhanced,
  GetDatabaseRowsResponseEnhanced,
  BulkUpdateRowsRequestEnhanced,
  FilterEnhanced,
  SortConfig,
  DatabasePerformanceMetrics
} from '~/types/database-block-enhanced';
import { formulaEngine, FormulaDependencyTracker } from './formula-engine.server';

/**
 * High-performance Database Block Service with:
 * - Redis caching for aggregations and frequently accessed data
 * - Partitioned storage for 50k+ records
 * - Optimized query execution with proper indexing
 * - Real-time updates with minimal overhead
 * - Formula engine integration
 * - Batch operations for bulk updates
 */
export class DatabaseBlockEnhancedService {
  private supabase = createSupabaseAdmin();
  private redis: Redis;
  private dependencyTracker: FormulaDependencyTracker;
  private cachePrefix = 'db_block:';
  private cacheTTL = 3600; // 1 hour

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.dependencyTracker = new FormulaDependencyTracker();
  }

  // ==================== Database Block CRUD ====================

  async createDatabaseBlock(
    blockId: string,
    name: string,
    description?: string,
    templateId?: string
  ): Promise<DatabaseBlockEnhanced> {
    let schema: DatabaseColumnEnhanced[] = [];
    let settings = this.getDefaultSettings();

    // If creating from template
    if (templateId) {
      const template = await this.getDatabaseTemplate(templateId);
      if (template) {
        schema = template.schema;
        settings = template.settings;
      }
    } else {
      schema = this.getDefaultSchema();
    }

    const { data, error } = await this.supabase
      .from('db_blocks_enhanced')
      .insert({
        block_id: blockId,
        name,
        description,
        schema,
        settings,
        views: [this.createDefaultView(schema)]
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create database block: ${error.message}`);
    }

    // Initialize formula dependencies
    this.updateFormulaDependencies(data.id, schema);

    // Create initial sample data if from template
    if (templateId) {
      await this.createInitialDataFromTemplate(data.id, templateId);
    }

    return this.mapDatabaseBlock(data);
  }

  async getDatabaseBlock(blockId: string): Promise<DatabaseBlockEnhanced | null> {
    // Try cache first
    const cacheKey = `${this.cachePrefix}block:${blockId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const { data, error } = await this.supabase
      .from('db_blocks_enhanced')
      .select('*')
      .eq('block_id', blockId)
      .single();

    if (error || !data) {
      return null;
    }

    const block = this.mapDatabaseBlock(data);
    
    // Cache for future requests
    await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(block));
    
    return block;
  }

  async updateDatabaseBlock(
    id: string,
    updates: Partial<DatabaseBlockEnhanced>
  ): Promise<DatabaseBlockEnhanced> {
    const { data, error } = await this.supabase
      .from('db_blocks_enhanced')
      .update({
        name: updates.name,
        description: updates.description,
        schema: updates.schema,
        views: updates.views,
        settings: updates.settings,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update database block: ${error.message}`);
    }

    // Update formula dependencies if schema changed
    if (updates.schema) {
      this.updateFormulaDependencies(id, updates.schema);
    }

    // Invalidate cache
    await this.invalidateBlockCache(data.block_id);
    
    return this.mapDatabaseBlock(data);
  }

  // ==================== High-Performance Row Operations ====================

  async getDatabaseRows(
    request: GetDatabaseRowsRequestEnhanced
  ): Promise<GetDatabaseRowsResponseEnhanced> {
    const {
      databaseBlockId,
      viewId,
      limit = 50,
      offset = 0,
      filters = [],
      sorts = [],
      search,
      includeComputedData = true,
      includeMetadata = false
    } = request;

    // Get database block
    const block = await this.getDatabaseBlock(databaseBlockId);
    if (!block) {
      throw new Error('Database block not found');
    }

    // Get view configuration if specified
    let activeView: DatabaseViewEnhanced | null = null;
    if (viewId) {
      activeView = block.views.find(v => v.id === viewId) || null;
    }

    // Build cache key for this specific query
    const cacheKey = this.buildQueryCacheKey(databaseBlockId, {
      viewId, limit, offset, filters, sorts, search
    });

    // Try cache first for expensive queries
    if (limit <= 100 && !includeMetadata) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const result = JSON.parse(cached);
        result.cachedAt = new Date().toISOString();
        return result;
      }
    }

    // Execute optimized query
    const result = await this.executeOptimizedQuery(block, {
      limit,
      offset,
      filters: activeView ? [...activeView.filters, ...filters] : filters,
      sorts: activeView ? [...activeView.sorts, ...sorts] : sorts,
      search,
      includeComputedData,
      includeMetadata
    });

    // Cache result for future requests (shorter TTL for large datasets)
    const cacheTTL = result.totalCount > 1000 ? 300 : this.cacheTTL;
    await this.redis.setex(cacheKey, cacheTTL, JSON.stringify(result));

    return result;
  }

  async createRow(
    databaseBlockId: string,
    data: Record<string, any>,
    userId: string
  ): Promise<DatabaseRowEnhanced> {
    const block = await this.getDatabaseBlock(databaseBlockId);
    if (!block) {
      throw new Error('Database block not found');
    }

    // Validate data against schema
    const validationErrors = this.validateRowData(data, block.schema);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }

    // Prepare complete data with defaults
    const completeData = this.prepareRowData(data, block.schema);

    // Get next auto number
    const autoNumber = await this.getNextAutoNumber(block.id);

    const { data: row, error } = await this.supabase
      .from('db_block_rows_partitioned')
      .insert({
        db_block_id: block.id,
        data: completeData,
        auto_number: autoNumber,
        position: autoNumber,
        created_by: userId,
        updated_by: userId
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create row: ${error.message}`);
    }

    // Compute formula values
    const computedData = await this.computeFormulaValues(
      this.mapRow(row),
      block.schema
    );

    // Update computed data if any formulas exist
    if (Object.keys(computedData).length > 0) {
      await this.supabase
        .from('db_block_rows_partitioned')
        .update({ computed_data: computedData })
        .eq('id', row.id);
    }

    // Invalidate caches
    await this.invalidateRowCaches(block.blockId);

    return this.mapRow({ ...row, computed_data: computedData });
  }

  async updateRow(
    id: string,
    data: Record<string, any>,
    version: number,
    userId: string
  ): Promise<DatabaseRowEnhanced> {
    // Get current row
    const { data: currentRow, error: fetchError } = await this.supabase
      .from('db_block_rows_partitioned')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !currentRow) {
      throw new Error('Row not found');
    }

    // Optimistic concurrency check
    if (currentRow.version !== version) {
      throw new Error('Row has been modified by another user');
    }

    // Get database block for validation
    const block = await this.getDatabaseBlock(currentRow.db_block_id);
    if (!block) {
      throw new Error('Database block not found');
    }

    // Validate updated data
    const mergedData = { ...currentRow.data, ...data };
    const validationErrors = this.validateRowData(mergedData, block.schema);
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }

    // Determine which columns changed
    const changedColumns = Object.keys(data).filter(
      key => currentRow.data[key] !== data[key]
    );

    // Get affected formula columns
    const affectedFormulas = this.dependencyTracker.getAffectedColumns(changedColumns);

    // Update the row
    const { data: updatedRow, error } = await this.supabase
      .from('db_block_rows_partitioned')
      .update({
        data: mergedData,
        version: version + 1,
        updated_at: new Date().toISOString(),
        updated_by: userId
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update row: ${error.message}`);
    }

    // Recompute affected formulas
    if (affectedFormulas.length > 0) {
      const computedData = await this.computeFormulaValues(
        this.mapRow(updatedRow),
        block.schema,
        affectedFormulas
      );

      // Update computed data
      await this.supabase
        .from('db_block_rows_partitioned')
        .update({ computed_data: { ...currentRow.computed_data, ...computedData } })
        .eq('id', id);

      updatedRow.computed_data = { ...currentRow.computed_data, ...computedData };
    }

    // Invalidate caches
    await this.invalidateRowCaches(block.blockId);

    return this.mapRow(updatedRow);
  }

  async bulkUpdateRows(
    request: BulkUpdateRowsRequestEnhanced
  ): Promise<{ updated: number; errors: string[] }> {
    const { databaseBlockId, updates, invalidateCache = true } = request;
    
    const block = await this.getDatabaseBlock(databaseBlockId);
    if (!block) {
      throw new Error('Database block not found');
    }

    let updated = 0;
    const errors: string[] = [];

    // Process updates in batches of 100
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      
      try {
        const { data, error } = await this.supabase.rpc('bulk_update_rows_optimized', {
          p_db_block_id: block.id,
          p_updates: batch.map(update => ({
            id: update.id,
            data: JSON.stringify(update.data || {}),
            version: update.version
          }))
        });

        if (error) {
          errors.push(`Batch ${i / batchSize + 1}: ${error.message}`);
        } else {
          updated += data || 0;
        }
      } catch (error) {
        errors.push(`Batch ${i / batchSize + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (invalidateCache) {
      await this.invalidateRowCaches(databaseBlockId);
    }

    return { updated, errors };
  }

  async deleteRows(ids: string[]): Promise<number> {
    // Soft delete for better performance and audit trail
    const { data, error } = await this.supabase
      .from('db_block_rows_partitioned')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: 'auth.uid()' // This would be replaced by actual user ID
      })
      .in('id', ids);

    if (error) {
      throw new Error(`Failed to delete rows: ${error.message}`);
    }

    return ids.length;
  }

  // ==================== Aggregations and Analytics ====================

  async getAggregation(
    databaseBlockId: string,
    columnId: string,
    aggregationType: string,
    filters?: FilterEnhanced[]
  ): Promise<any> {
    const block = await this.getDatabaseBlock(databaseBlockId);
    if (!block) {
      throw new Error('Database block not found');
    }

    // Check cache first
    const filterHash = filters ? this.hashFilters(filters) : '';
    const cacheKey = `${this.cachePrefix}agg:${block.id}:${columnId}:${aggregationType}:${filterHash}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Compute aggregation
    const { data, error } = await this.supabase.rpc('get_aggregation_cached', {
      p_db_block_id: block.id,
      p_column_id: columnId,
      p_aggregation_type: aggregationType,
      p_filters: filters ? JSON.stringify(filters) : null
    });

    if (error) {
      throw new Error(`Failed to compute aggregation: ${error.message}`);
    }

    // Cache result
    await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(data));

    return data;
  }

  async getPerformanceMetrics(databaseBlockId: string): Promise<DatabasePerformanceMetrics> {
    const block = await this.getDatabaseBlock(databaseBlockId);
    if (!block) {
      throw new Error('Database block not found');
    }

    // Get metrics from materialized view
    const { data, error } = await this.supabase
      .from('db_block_stats')
      .select('*')
      .eq('db_block_id', block.id)
      .single();

    if (error) {
      throw new Error(`Failed to get performance metrics: ${error.message}`);
    }

    return {
      databaseBlockId: block.blockId,
      rowCount: data.active_rows,
      avgQueryTime: 0, // TODO: Implement query time tracking
      cacheHitRate: await this.getCacheHitRate(block.blockId),
      indexUsage: {}, // TODO: Implement index usage tracking
      activeConnections: 0, // TODO: Implement connection tracking
      lastOptimized: data.last_updated
    };
  }

  // ==================== Private Helper Methods ====================

  private async executeOptimizedQuery(
    block: DatabaseBlockEnhanced,
    options: {
      limit: number;
      offset: number;
      filters: FilterEnhanced[];
      sorts: SortConfig[];
      search?: string;
      includeComputedData: boolean;
      includeMetadata: boolean;
    }
  ): Promise<GetDatabaseRowsResponseEnhanced> {
    const { limit, offset, filters, sorts, search, includeComputedData, includeMetadata } = options;

    // Use optimized function for complex queries
    const { data, error } = await this.supabase.rpc('get_db_rows_optimized', {
      p_db_block_id: block.id,
      p_limit: limit,
      p_offset: offset,
      p_filters: filters.length > 0 ? JSON.stringify(filters) : null,
      p_sorts: sorts.length > 0 ? JSON.stringify(sorts) : null,
      p_search: search || null
    });

    if (error) {
      throw new Error(`Failed to fetch rows: ${error.message}`);
    }

    const rows = data?.map((row: any) => this.mapRow(row)) || [];
    const totalCount = rows.length > 0 ? rows[0].totalCount : 0;

    // Compute aggregations if requested
    let aggregations: Record<string, any> = {};
    if (includeComputedData) {
      aggregations = await this.computeViewAggregations(block, filters);
    }

    return {
      rows: rows.map(row => {
        const { totalCount, ...rowData } = row as any;
        return rowData;
      }),
      totalCount,
      hasMore: offset + limit < totalCount,
      aggregations
    };
  }

  private async computeFormulaValues(
    row: DatabaseRowEnhanced,
    columns: DatabaseColumnEnhanced[],
    specificColumns?: string[]
  ): Promise<Record<string, any>> {
    const computedData: Record<string, any> = {};
    
    const formulaColumns = columns.filter(col => 
      col.type === 'formula' && 
      col.formula?.expression &&
      (!specificColumns || specificColumns.includes(col.columnId))
    );

    for (const column of formulaColumns) {
      try {
        const context = {
          row,
          allRows: [], // TODO: Load related rows if needed
          columns,
          relations: {},
          aggregations: {},
          functions: {}
        };

        const result = await formulaEngine.evaluate(
          column.formula!.expression,
          context,
          column.columnId
        );

        computedData[column.columnId] = result.value;
      } catch (error) {
        console.error(`Error computing formula for column ${column.columnId}:`, error);
        computedData[column.columnId] = null;
      }
    }

    return computedData;
  }

  private updateFormulaDependencies(databaseBlockId: string, schema: DatabaseColumnEnhanced[]) {
    for (const column of schema) {
      if (column.type === 'formula' && column.formula?.expression) {
        const dependencies = formulaEngine.extractDependencies(column.formula.expression);
        this.dependencyTracker.updateDependencies(column.columnId, dependencies);
      }
    }
  }

  private validateRowData(data: Record<string, any>, schema: DatabaseColumnEnhanced[]): string[] {
    const errors: string[] = [];

    for (const column of schema) {
      const value = data[column.columnId];
      
      // Skip computed columns
      if (['formula', 'rollup', 'lookup', 'created_time', 'updated_time', 
           'created_by', 'updated_by', 'auto_number'].includes(column.type)) {
        continue;
      }

      // Validate using enhanced validator
      const validation = this.validateValue(column, value);
      if (!validation.valid) {
        errors.push(validation.error || `Invalid value for ${column.name}`);
      }
    }

    return errors;
  }

  private validateValue(column: DatabaseColumnEnhanced, value: any): { valid: boolean; error?: string } {
    // Basic required check
    if (column.isRequired && (value === null || value === undefined || value === '')) {
      return { valid: false, error: `${column.name} is required` };
    }

    // Type-specific validation would go here
    // For now, return valid
    return { valid: true };
  }

  private prepareRowData(data: Record<string, any>, schema: DatabaseColumnEnhanced[]): Record<string, any> {
    const result: Record<string, any> = {};

    for (const column of schema) {
      if (data[column.columnId] !== undefined) {
        result[column.columnId] = data[column.columnId];
      } else if (column.defaultValue !== undefined) {
        result[column.columnId] = column.defaultValue;
      } else {
        result[column.columnId] = this.getDefaultValueForType(column.type);
      }
    }

    return result;
  }

  private getDefaultValueForType(type: string): any {
    switch (type) {
      case 'text': case 'email': case 'url': case 'phone': return '';
      case 'number': case 'currency': case 'percent': case 'rating': return 0;
      case 'checkbox': return false;
      case 'select': case 'multi_select': return null;
      case 'date': case 'datetime': return null;
      case 'people': case 'files': return [];
      default: return null;
    }
  }

  private async getNextAutoNumber(databaseBlockId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('db_block_rows_partitioned')
      .select('auto_number')
      .eq('db_block_id', databaseBlockId)
      .order('auto_number', { ascending: false })
      .limit(1);

    if (error) {
      return 1;
    }

    return (data[0]?.auto_number || 0) + 1;
  }

  private buildQueryCacheKey(databaseBlockId: string, params: any): string {
    const keyData = JSON.stringify(params);
    const hash = require('crypto').createHash('md5').update(keyData).digest('hex');
    return `${this.cachePrefix}query:${databaseBlockId}:${hash}`;
  }

  private hashFilters(filters: FilterEnhanced[]): string {
    return require('crypto').createHash('md5').update(JSON.stringify(filters)).digest('hex');
  }

  private async invalidateBlockCache(blockId: string) {
    await this.redis.del(`${this.cachePrefix}block:${blockId}`);
  }

  private async invalidateRowCaches(databaseBlockId: string) {
    const pattern = `${this.cachePrefix}query:${databaseBlockId}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    
    // Also invalidate aggregation caches
    const aggPattern = `${this.cachePrefix}agg:${databaseBlockId}:*`;
    const aggKeys = await this.redis.keys(aggPattern);
    if (aggKeys.length > 0) {
      await this.redis.del(...aggKeys);
    }
  }

  private async getCacheHitRate(databaseBlockId: string): Promise<number> {
    // TODO: Implement cache hit rate tracking
    return 0.85; // Placeholder
  }

  private async computeViewAggregations(
    block: DatabaseBlockEnhanced,
    filters: FilterEnhanced[]
  ): Promise<Record<string, any>> {
    // TODO: Implement view-specific aggregations
    return {};
  }

  private async getDatabaseTemplate(templateId: string): Promise<any> {
    // TODO: Implement template loading
    return null;
  }

  private async createInitialDataFromTemplate(databaseBlockId: string, templateId: string) {
    // TODO: Implement template data creation
  }

  private getDefaultSchema(): DatabaseColumnEnhanced[] {
    return [
      {
        id: 'col-title',
        databaseBlockId: '',
        columnId: 'title',
        name: 'Title',
        type: 'text',
        position: 0,
        width: 200,
        isRequired: true,
        config: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'col-status',
        databaseBlockId: '',
        columnId: 'status',
        name: 'Status',
        type: 'select',
        position: 1,
        width: 150,
        config: {
          options: [
            { id: '1', value: 'todo', label: 'To Do', color: 'gray', order: 0 },
            { id: '2', value: 'in-progress', label: 'In Progress', color: 'blue', order: 1 },
            { id: '3', value: 'done', label: 'Done', color: 'green', order: 2 }
          ]
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
  }

  private getDefaultSettings(): any {
    return {
      rowHeight: 'normal',
      showRowNumbers: true,
      showGridLines: true,
      alternateRowColors: false,
      frozenColumns: 0,
      allowInlineEdit: true,
      allowRowSelection: true,
      allowMultiSelect: true,
      allowComments: true,
      allowHistory: true,
      cacheAggregations: true,
      partitionThreshold: 10000,
      virtualScrolling: true,
      enableRealtime: true
    };
  }

  private createDefaultView(schema: DatabaseColumnEnhanced[]): DatabaseViewEnhanced {
    return {
      id: 'default-view',
      databaseBlockId: '',
      name: 'All Records',
      type: 'table',
      filters: [],
      sorts: [],
      visibleColumns: schema.map(col => col.columnId),
      columnOrder: schema.map(col => col.columnId),
      frozenColumns: 0,
      settings: {
        rowHeight: 'normal',
        showRowNumbers: true
      },
      isDefault: true,
      isPublic: false,
      isTemplate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  private mapDatabaseBlock(data: any): DatabaseBlockEnhanced {
    return {
      id: data.id,
      blockId: data.block_id,
      name: data.name,
      description: data.description,
      icon: data.icon,
      coverImage: data.cover_image,
      schema: data.schema || [],
      relations: [],
      views: data.views || [],
      defaultViewId: data.default_view_id,
      settings: data.settings || this.getDefaultSettings(),
      rowCount: data.row_count || 0,
      lastAggregationUpdate: data.last_aggregation_update,
      isTemplate: data.is_template || false,
      templateCategory: data.template_category,
      parentTemplateId: data.parent_template_id,
      version: data.version || 1,
      schemaVersion: data.schema_version || 1,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      createdBy: data.created_by,
      updatedBy: data.updated_by
    };
  }

  private mapRow(data: any): DatabaseRowEnhanced {
    return {
      id: data.id,
      databaseBlockId: data.db_block_id,
      data: data.data || {},
      computedData: data.computed_data || {},
      position: data.position,
      autoNumber: data.auto_number,
      metadata: data.metadata || {},
      tags: data.tags || [],
      version: data.version || 1,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      createdBy: data.created_by,
      updatedBy: data.updated_by,
      deletedAt: data.deleted_at,
      deletedBy: data.deleted_by
    };
  }
}

export const databaseBlockEnhancedService = new DatabaseBlockEnhancedService();