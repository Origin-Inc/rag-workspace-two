// Core Database Block Service
// Implements foundational CRUD operations for database blocks with 50k+ record support

import { createSupabaseAdmin } from '~/utils/supabase.server';
import type { 
  DatabaseBlockCore,
  DatabaseColumnCore,
  DatabaseRowCore,
  DatabaseBlockSettings,
  CreateDatabaseBlockInput,
  UpdateDatabaseBlockInput,
  CreateRowInput,
  UpdateRowInput,
  FilterCondition,
  SortConfig
} from '~/types/database-block-core';
import { databaseSchemaService } from './database-schema.server';
import { databaseValidationService } from './database-validation.server';
import { databaseStorageService } from './database-storage.server';

export class DatabaseBlockCoreService {
  private supabase = createSupabaseAdmin();

  // ============= Database Block CRUD =============

  /**
   * Create a new database block with initial schema
   */
  async createDatabaseBlock(input: CreateDatabaseBlockInput): Promise<DatabaseBlockCore> {
    // First check if the block exists
    const { data: existingBlock } = await this.supabase
      .from('blocks')
      .select('id')
      .eq('id', input.blockId)
      .single();

    if (!existingBlock) {
      throw new Error('Block does not exist');
    }

    // Validate schema if provided
    const schema = input.schema || this.getDefaultSchema();
    const schemaValidation = databaseSchemaService.validateSchema(schema);
    if (!schemaValidation.valid) {
      throw new Error(`Invalid schema: ${schemaValidation.errors.join(', ')}`);
    }

    // Create the database block
    const { data: dbBlock, error } = await this.supabase
      .from('db_blocks_enhanced')
      .insert({
        block_id: input.blockId,
        name: input.name || 'Untitled Database',
        description: input.description,
        schema: schema,
        settings: input.settings || this.getDefaultSettings(),
        created_by: input.userId,
        updated_by: input.userId
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create database block: ${error.message}`);
    }

    // Create indexes for the database block
    await databaseStorageService.createIndexes(input.blockId, schema);

    return this.mapToCore(dbBlock);
  }

  /**
   * Get a database block by ID
   */
  async getDatabaseBlock(blockId: string): Promise<DatabaseBlockCore | null> {
    const { data, error } = await this.supabase
      .from('db_blocks_enhanced')
      .select('*')
      .eq('block_id', blockId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapToCore(data);
  }

  /**
   * Update database block metadata and settings
   */
  async updateDatabaseBlock(
    blockId: string,
    updates: UpdateDatabaseBlockInput
  ): Promise<DatabaseBlockCore> {
    const { data, error } = await this.supabase
      .from('db_blocks_enhanced')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('block_id', blockId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update database block: ${error.message}`);
    }

    return this.mapToCore(data);
  }

  /**
   * Delete a database block and all its data
   */
  async deleteDatabaseBlock(blockId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('db_blocks_enhanced')
      .delete()
      .eq('block_id', blockId);

    if (error) {
      throw new Error(`Failed to delete database block: ${error.message}`);
    }

    return true;
  }

  // ============= Column Management =============

  /**
   * Add a new column to the database schema
   */
  async addColumn(
    blockId: string,
    column: DatabaseColumnCore
  ): Promise<DatabaseBlockCore> {
    const dbBlock = await this.getDatabaseBlock(blockId);
    if (!dbBlock) {
      throw new Error('Database block not found');
    }

    const newSchema = [...dbBlock.schema, column];

    return this.updateDatabaseBlock(blockId, { schema: newSchema });
  }

  /**
   * Update a column in the database schema
   */
  async updateColumn(
    blockId: string,
    columnId: string,
    updates: Partial<DatabaseColumnCore>
  ): Promise<DatabaseBlockCore> {
    const dbBlock = await this.getDatabaseBlock(blockId);
    if (!dbBlock) {
      throw new Error('Database block not found');
    }

    const newSchema = dbBlock.schema.map(col =>
      col.id === columnId ? { ...col, ...updates } : col
    );

    return this.updateDatabaseBlock(blockId, { schema: newSchema });
  }

  /**
   * Delete a column from the database schema
   */
  async deleteColumn(
    blockId: string,
    columnId: string
  ): Promise<DatabaseBlockCore> {
    const dbBlock = await this.getDatabaseBlock(blockId);
    if (!dbBlock) {
      throw new Error('Database block not found');
    }

    const newSchema = dbBlock.schema.filter(col => col.id !== columnId);

    // Also remove column data from all rows
    await this.removeColumnDataFromRows(dbBlock.id, columnId);

    return this.updateDatabaseBlock(blockId, { schema: newSchema });
  }

  // ============= Row Operations =============

  /**
   * Get rows with pagination, filtering, and sorting
   */
  async getRows(
    blockId: string,
    options: {
      offset?: number;
      limit?: number;
      filters?: FilterCondition[];
      sorts?: SortConfig[];
    } = {}
  ): Promise<{ rows: DatabaseRowCore[]; totalCount: number }> {
    const dbBlock = await this.getDatabaseBlock(blockId);
    if (!dbBlock) {
      throw new Error('Database block not found');
    }

    // Build the query
    let query = this.supabase
      .from('db_block_rows_partitioned')
      .select('*', { count: 'exact' })
      .eq('db_block_id', dbBlock.id)
      .is('deleted_at', null);

    // Apply filters
    if (options.filters && options.filters.length > 0) {
      query = this.applyFilters(query, options.filters);
    }

    // Apply sorting
    if (options.sorts && options.sorts.length > 0) {
      for (const sort of options.sorts) {
        query = query.order(
          `data->>${sort.columnId}`,
          { ascending: sort.direction === 'asc' }
        );
      }
    } else {
      // Default sorting by position
      query = query.order('position', { ascending: true });
    }

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch rows: ${error.message}`);
    }

    return {
      rows: data?.map(row => this.mapRowToCore(row)) || [],
      totalCount: count || 0
    };
  }

  /**
   * Create a new row
   */
  async createRow(
    blockId: string,
    input: CreateRowInput
  ): Promise<DatabaseRowCore> {
    const dbBlock = await this.getDatabaseBlock(blockId);
    if (!dbBlock) {
      throw new Error('Database block not found');
    }

    // Validate row data against schema
    const validationResult = await databaseValidationService.validateRow(
      { id: '', data: input.data || {}, version: 0, createdAt: new Date(), updatedAt: new Date() },
      dbBlock.schema
    );
    
    if (!validationResult.valid) {
      throw new Error(`Invalid row data: ${validationResult.errors[0].message}`);
    }

    // Serialize data for storage
    const serializedData = databaseSchemaService.serializeRowData(input.data || {}, dbBlock.schema);

    // Compress data if needed
    const { compressed } = databaseStorageService.compressData(serializedData, dbBlock.schema);

    // Get the next position
    const { data: lastRow } = await this.supabase
      .from('db_block_rows_partitioned')
      .select('position')
      .eq('db_block_id', dbBlock.id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const nextPosition = (lastRow?.position || 0) + 1;

    const { data, error } = await this.supabase
      .from('db_block_rows_partitioned')
      .insert({
        db_block_id: dbBlock.id,
        data: compressed,
        position: nextPosition,
        created_by: input.userId,
        updated_by: input.userId
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create row: ${error.message}`);
    }

    // Update row count
    await this.updateRowCount(dbBlock.id);

    return this.mapRowToCore(data);
  }

  /**
   * Update a row
   */
  async updateRow(
    rowId: string,
    updates: UpdateRowInput
  ): Promise<DatabaseRowCore> {
    const { data, error } = await this.supabase
      .from('db_block_rows_partitioned')
      .update({
        data: updates.data,
        updated_at: new Date().toISOString(),
        updated_by: updates.userId,
        version: updates.version
      })
      .eq('id', rowId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update row: ${error.message}`);
    }

    return this.mapRowToCore(data);
  }

  /**
   * Delete rows (soft delete)
   */
  async deleteRows(rowIds: string[], userId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('db_block_rows_partitioned')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: userId
      })
      .in('id', rowIds);

    if (error) {
      throw new Error(`Failed to delete rows: ${error.message}`);
    }

    return true;
  }

  /**
   * Bulk create rows for testing
   */
  async bulkCreateRows(
    blockId: string,
    count: number,
    userId: string
  ): Promise<number> {
    const dbBlock = await this.getDatabaseBlock(blockId);
    if (!dbBlock) {
      throw new Error('Database block not found');
    }

    const rows = [];
    const batchSize = 100;
    
    // Get starting position
    const { data: lastRow } = await this.supabase
      .from('db_block_rows_partitioned')
      .select('position')
      .eq('db_block_id', dbBlock.id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    let position = (lastRow?.position || 0) + 1;

    for (let i = 0; i < count; i++) {
      rows.push({
        db_block_id: dbBlock.id,
        data: this.generateTestRowData(i, dbBlock.schema),
        position: position++,
        created_by: userId,
        updated_by: userId
      });

      // Insert in batches
      if (rows.length >= batchSize || i === count - 1) {
        const { error } = await this.supabase
          .from('db_block_rows_partitioned')
          .insert(rows);

        if (error) {
          throw new Error(`Failed to bulk create rows: ${error.message}`);
        }

        rows.length = 0;
      }
    }

    // Update row count
    await this.updateRowCount(dbBlock.id);

    return count;
  }

  // ============= Helper Methods =============

  private mapToCore(dbBlock: any): DatabaseBlockCore {
    return {
      id: dbBlock.id,
      blockId: dbBlock.block_id,
      name: dbBlock.name,
      description: dbBlock.description,
      schema: dbBlock.schema,
      settings: dbBlock.settings,
      rowCount: dbBlock.row_count || 0,
      createdAt: dbBlock.created_at,
      updatedAt: dbBlock.updated_at
    };
  }

  private mapRowToCore(row: any): DatabaseRowCore {
    return {
      id: row.id,
      data: row.data,
      computedData: row.computed_data || {},
      position: row.position,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private getDefaultSchema(): DatabaseColumnCore[] {
    return [
      {
        id: 'title',
        name: 'Title',
        type: 'text',
        width: 300,
        isRequired: false
      },
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        width: 150,
        options: [
          { id: 'todo', label: 'To Do', color: 'gray' },
          { id: 'in_progress', label: 'In Progress', color: 'blue' },
          { id: 'done', label: 'Done', color: 'green' }
        ]
      },
      {
        id: 'priority',
        name: 'Priority',
        type: 'select',
        width: 150,
        options: [
          { id: 'low', label: 'Low', color: 'gray' },
          { id: 'medium', label: 'Medium', color: 'yellow' },
          { id: 'high', label: 'High', color: 'red' }
        ]
      },
      {
        id: 'created_at',
        name: 'Created',
        type: 'created_time',
        width: 150
      }
    ];
  }

  private getDefaultSettings(): DatabaseBlockSettings {
    return {
      rowHeight: 'normal',
      showRowNumbers: true,
      frozenColumns: 0,
      enableComments: true,
      enableHistory: true,
      virtualScrolling: true
    };
  }

  private applyFilters(query: any, filters: FilterCondition[]): any {
    for (const filter of filters) {
      const column = `data->>${filter.columnId}`;
      
      switch (filter.operator) {
        case 'equals':
          query = query.eq(column, filter.value);
          break;
        case 'not_equals':
          query = query.neq(column, filter.value);
          break;
        case 'contains':
          query = query.ilike(column, `%${filter.value}%`);
          break;
        case 'not_contains':
          query = query.not(column, 'ilike', `%${filter.value}%`);
          break;
        case 'is_empty':
          query = query.or(`${column}.is.null,${column}.eq.`);
          break;
        case 'is_not_empty':
          query = query.not(column, 'is', null);
          break;
        case 'greater_than':
          query = query.gt(column, filter.value);
          break;
        case 'less_than':
          query = query.lt(column, filter.value);
          break;
      }
    }
    
    return query;
  }

  private async removeColumnDataFromRows(
    dbBlockId: string,
    columnId: string
  ): Promise<void> {
    // This would need to be implemented with a custom SQL function
    // For now, we'll skip this optimization
  }

  private async updateRowCount(dbBlockId: string): Promise<void> {
    const { count } = await this.supabase
      .from('db_block_rows_partitioned')
      .select('*', { count: 'exact', head: true })
      .eq('db_block_id', dbBlockId)
      .is('deleted_at', null);

    await this.supabase
      .from('db_blocks_enhanced')
      .update({ row_count: count || 0 })
      .eq('id', dbBlockId);
  }

  private generateTestRowData(index: number, schema: DatabaseColumnCore[]): any {
    const data: any = {};
    
    for (const column of schema) {
      switch (column.type) {
        case 'text':
          data[column.id] = `${column.name} ${index + 1}`;
          break;
        case 'number':
          data[column.id] = Math.floor(Math.random() * 1000);
          break;
        case 'select':
          if (column.options && column.options.length > 0) {
            const randomOption = column.options[Math.floor(Math.random() * column.options.length)];
            data[column.id] = randomOption.id;
          }
          break;
        case 'checkbox':
          data[column.id] = Math.random() > 0.5;
          break;
        case 'date':
        case 'datetime':
          const date = new Date();
          date.setDate(date.getDate() - Math.floor(Math.random() * 365));
          data[column.id] = date.toISOString();
          break;
        case 'currency':
        case 'percent':
          data[column.id] = Math.random() * 100;
          break;
        case 'rating':
          data[column.id] = Math.floor(Math.random() * 5) + 1;
          break;
      }
    }
    
    return data;
  }
}

export const databaseBlockCoreService = new DatabaseBlockCoreService();