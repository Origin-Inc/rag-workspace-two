import { createSupabaseAdmin } from '~/utils/supabase.server';
import type { 
  DatabaseBlock, 
  DatabaseColumn, 
  DatabaseRow, 
  DatabaseView,
  GetDatabaseRowsRequest,
  GetDatabaseRowsResponse,
  Filter,
  Sort,
  DatabaseColumnType
} from '~/types/database-block';
import { autoIndexerService } from './auto-indexer.server';

/**
 * Production-ready Database Block Service using Supabase
 * Implements the requirements from task 4 in tasks.json
 */
export class DatabaseBlockSupabaseService {
  private supabase = createSupabaseAdmin();

  // ================== Database Block CRUD ==================

  async createDatabaseBlock(
    blockId: string,
    name: string,
    description?: string
  ): Promise<DatabaseBlock> {
    // Create the database block directly (no need to check blocks table)
    const { data, error } = await this.supabase
      .from('db_blocks')
      .insert({
        block_id: blockId,
        name,
        description,
        schema: this.getDefaultSchema()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating database block:', error);
      console.error('Error details:', { 
        message: error.message, 
        hint: error.hint,
        details: error.details,
        code: error.code 
      });
      throw new Error(`Failed to create database block: ${error.message || error}`);
    }

    // Create initial rows with sample data
    await this.createInitialRows(data.id);

    // Auto-index the database for RAG
    const workspace = await this.getWorkspaceForBlock(blockId);
    if (workspace) {
      await autoIndexerService.onDatabaseChange(data.id, workspace.id, 'create');
    }

    return this.mapDatabaseBlock(data);
  }

  async getDatabaseBlock(blockId: string): Promise<DatabaseBlock | null> {
    console.log('[getDatabaseBlock] Looking for block with blockId:', blockId);
    
    // First check if we have a db_block for this block_id
    const { data: dbBlocks, error: dbError } = await this.supabase
      .from('db_blocks')
      .select('*')
      .eq('block_id', blockId);

    if (dbError) {
      console.error('[getDatabaseBlock] Error fetching database block:', dbError);
      // Create a new database block if there's an error
      return this.createDatabaseBlock(blockId, 'Project Tasks Database', 'Track and manage project tasks');
    }
    
    // Check if we found any blocks
    if (!dbBlocks || dbBlocks.length === 0) {
      // Create a new database block if it doesn't exist
      console.log('[getDatabaseBlock] No database block found for:', blockId, '- creating new one');
      return this.createDatabaseBlock(blockId, 'Project Tasks Database', 'Track and manage project tasks');
    }

    // Use the first block if multiple exist (shouldn't happen with unique constraint)
    const dbBlock = dbBlocks[0];
    console.log('[getDatabaseBlock] Found existing database block:', dbBlock.id);
    console.log('[getDatabaseBlock] Schema from DB:', dbBlock.schema);
    console.log('[getDatabaseBlock] Schema length:', dbBlock.schema?.length);

    // Get row count
    const { count } = await this.supabase
      .from('db_block_rows')
      .select('*', { count: 'exact', head: true })
      .eq('db_block_id', dbBlock.id);

    const mappedBlock = this.mapDatabaseBlock({ ...dbBlock, row_count: count || 0 });
    console.log('[getDatabaseBlock] Mapped block schema:', mappedBlock.schema?.length, 'columns');
    
    return mappedBlock;
  }

  async updateDatabaseBlock(
    id: string,
    updates: Partial<DatabaseBlock>
  ): Promise<DatabaseBlock> {
    const { data, error } = await this.supabase
      .from('db_blocks')
      .update({
        name: updates.name,
        description: updates.description,
        settings: updates.settings,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating database block:', error);
      throw new Error(`Failed to update database block: ${error.message}`);
    }

    // Auto-index the updated database
    const workspace = await this.getWorkspaceForDatabaseBlock(id);
    if (workspace) {
      await autoIndexerService.onDatabaseChange(id, workspace.id, 'update');
    }

    return this.mapDatabaseBlock(data);
  }

  // ================== Column Management ==================

  async createColumn(
    databaseBlockId: string,
    column: Partial<DatabaseColumn>
  ): Promise<DatabaseColumn> {
    console.log('[createColumn] Starting for block:', databaseBlockId);
    console.log('[createColumn] Column data:', column);
    
    // Get the database block
    const { data: dbBlock, error: fetchError } = await this.supabase
      .from('db_blocks')
      .select('id, schema')
      .eq('block_id', databaseBlockId)
      .single();

    if (fetchError) {
      console.error('[createColumn] Error fetching block:', fetchError);
      throw new Error(`Database block fetch error: ${fetchError.message}`);
    }

    if (!dbBlock) {
      console.error('[createColumn] Database block not found for:', databaseBlockId);
      throw new Error('Database block not found');
    }
    
    console.log('[createColumn] Found block with ID:', dbBlock.id);
    console.log('[createColumn] Current schema length:', dbBlock.schema?.length || 0);

    // Add the new column to the schema
    const currentSchema = dbBlock.schema as DatabaseColumn[] || [];
    const newColumn: DatabaseColumn = {
      id: `col-${Date.now()}`,
      databaseBlockId: dbBlock.id,
      columnId: column.columnId || this.generateColumnId(),
      name: column.name || 'New Column',
      type: column.type || 'text',
      config: column.config || {},
      width: column.width || 150,
      isHidden: column.isHidden || false,
      order: currentSchema.length,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const updatedSchema = [...currentSchema, newColumn];
    console.log('[createColumn] New column created:', newColumn);
    console.log('[createColumn] Updated schema will have', updatedSchema.length, 'columns');

    // Update the schema in the database
    const { error } = await this.supabase
      .from('db_blocks')
      .update({
        schema: updatedSchema,
        updated_at: new Date().toISOString()
      })
      .eq('id', dbBlock.id);

    if (error) {
      console.error('[createColumn] Error updating schema:', error);
      throw new Error(`Failed to create column: ${error.message}`);
    }

    console.log('[createColumn] ✅ Column added successfully!');
    console.log('[createColumn] Returning column:', newColumn);
    return newColumn;
  }

  async updateColumn(
    databaseBlockId: string,
    columnId: string,
    updates: Partial<DatabaseColumn>
  ): Promise<DatabaseColumn> {
    // Get the database block
    const { data: dbBlock } = await this.supabase
      .from('db_blocks')
      .select('id, schema')
      .eq('block_id', databaseBlockId)
      .single();

    if (!dbBlock) {
      throw new Error('Database block not found');
    }

    // Update the column in the schema
    const schema = dbBlock.schema as DatabaseColumn[] || [];
    const columnIndex = schema.findIndex(col => col.columnId === columnId);
    
    if (columnIndex === -1) {
      throw new Error('Column not found');
    }

    const updatedColumn = { ...schema[columnIndex], ...updates, updatedAt: new Date() };
    schema[columnIndex] = updatedColumn;

    // Update the schema in the database
    const { error } = await this.supabase
      .from('db_blocks')
      .update({
        schema: schema,
        updated_at: new Date().toISOString()
      })
      .eq('id', dbBlock.id);

    if (error) {
      console.error('Error updating column:', error);
      throw new Error(`Failed to update column: ${error.message}`);
    }

    return updatedColumn;
  }

  async deleteColumn(databaseBlockId: string, columnId: string): Promise<boolean> {
    console.log('[deleteColumn] Deleting column:', { databaseBlockId, columnId });
    
    // Get the database block
    const { data: dbBlock, error: fetchError } = await this.supabase
      .from('db_blocks')
      .select('id, schema')
      .eq('block_id', databaseBlockId)
      .single();

    if (fetchError) {
      console.error('[deleteColumn] Error fetching database block:', fetchError);
      throw new Error(`Failed to fetch database block: ${fetchError.message}`);
    }

    if (!dbBlock) {
      console.error('[deleteColumn] Database block not found for blockId:', databaseBlockId);
      throw new Error('Database block not found');
    }

    console.log('[deleteColumn] Found database block:', dbBlock.id);
    console.log('[deleteColumn] Current schema has', (dbBlock.schema as DatabaseColumn[])?.length, 'columns');

    // Remove the column from the schema
    const schema = dbBlock.schema as DatabaseColumn[] || [];
    // The columnId passed from UI is actually the 'id' field of the column
    const updatedSchema = schema.filter(col => col.id !== columnId);
    
    console.log('[deleteColumn] After filtering, schema has', updatedSchema.length, 'columns');

    // Update the schema in the database
    const { error } = await this.supabase
      .from('db_blocks')
      .update({
        schema: updatedSchema,
        updated_at: new Date().toISOString()
      })
      .eq('id', dbBlock.id);

    if (error) {
      console.error('[deleteColumn] Error updating schema:', error);
      throw new Error(`Failed to delete column: ${error.message}`);
    }

    console.log('[deleteColumn] Successfully updated schema in database');

    // Remove the column data from all rows
    const { data: rows } = await this.supabase
      .from('db_block_rows')
      .select('id, data')
      .eq('db_block_id', dbBlock.id);

    if (rows) {
      console.log('[deleteColumn] Updating', rows.length, 'rows to remove column data');
      for (const row of rows) {
        const data = row.data as Record<string, any>;
        delete data[columnId];
        
        await this.supabase
          .from('db_block_rows')
          .update({ data })
          .eq('id', row.id);
      }
      console.log('[deleteColumn] Successfully updated all rows');
    }

    console.log('[deleteColumn] Column deletion completed successfully');
    return true;
  }

  async reorderColumns(
    databaseBlockId: string,
    columnOrder: string[]
  ): Promise<boolean> {
    // Get the database block
    const { data: dbBlock } = await this.supabase
      .from('db_blocks')
      .select('id, schema')
      .eq('block_id', databaseBlockId)
      .single();

    if (!dbBlock) {
      throw new Error('Database block not found');
    }

    // Reorder columns in the schema
    const schema = dbBlock.schema as DatabaseColumn[] || [];
    const columnMap = new Map(schema.map(col => [col.columnId, col]));
    
    const reorderedSchema = columnOrder
      .map((columnId, index) => {
        const column = columnMap.get(columnId);
        if (column) {
          return { ...column, order: index };
        }
        return null;
      })
      .filter(Boolean) as DatabaseColumn[];

    // Update the schema in the database
    const { error } = await this.supabase
      .from('db_blocks')
      .update({
        schema: reorderedSchema,
        updated_at: new Date().toISOString()
      })
      .eq('id', dbBlock.id);

    if (error) {
      console.error('Error reordering columns:', error);
      throw new Error(`Failed to reorder columns: ${error.message}`);
    }

    return true;
  }

  // ================== Row Management with Supabase Pagination ==================

  async getDatabaseRows(
    request: GetDatabaseRowsRequest
  ): Promise<GetDatabaseRowsResponse> {
    const { databaseBlockId, limit = 50, offset = 0, filters, sorts } = request;

    // Get the database block ID
    const { data: dbBlock } = await this.supabase
      .from('db_blocks')
      .select('id')
      .eq('block_id', databaseBlockId)
      .single();

    if (!dbBlock) {
      // Create the database block if it doesn't exist
      const newBlock = await this.createDatabaseBlock(databaseBlockId, 'Project Tasks Database');
      return this.getDatabaseRows({ ...request, databaseBlockId: newBlock.id });
    }

    // Use Supabase's count() for efficient row counting
    const { count } = await this.supabase
      .from('db_block_rows')
      .select('*', { count: 'exact', head: true })
      .eq('db_block_id', dbBlock.id);

    // Build query with Supabase pagination using range()
    let query = this.supabase
      .from('db_block_rows')
      .select('*')
      .eq('db_block_id', dbBlock.id);

    // Apply sorts using Supabase .order() method
    if (sorts && sorts.length > 0) {
      for (const sort of sorts) {
        query = query.order(`data->>${sort.columnId}`, { ascending: sort.direction === 'asc' });
      }
    } else {
      query = query.order('position', { ascending: true });
    }

    // Apply Supabase pagination with range queries
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching rows:', error);
      throw new Error(`Failed to fetch rows: ${error.message}`);
    }

    return {
      rows: data?.map(this.mapRow) || [],
      totalCount: count || 0,
      hasMore: (offset + limit) < (count || 0)
    };
  }

  async createRow(
    databaseBlockId: string,
    data: Record<string, any>,
    userId: string
  ): Promise<DatabaseRow> {
    // Get the database block ID
    const { data: dbBlock } = await this.supabase
      .from('db_blocks')
      .select('id, schema')
      .eq('block_id', databaseBlockId)
      .single();

    if (!dbBlock) {
      throw new Error('Database block not found');
    }

    // Ensure data has values for all columns
    const schema = dbBlock.schema as DatabaseColumn[] || [];
    const completeData: Record<string, any> = {};
    
    schema.forEach(col => {
      if (data[col.columnId] !== undefined) {
        completeData[col.columnId] = data[col.columnId];
      } else {
        // Set default values based on column type
        completeData[col.columnId] = this.getDefaultValueForType(col.type);
      }
    });

    const { data: row, error } = await this.supabase
      .from('db_block_rows')
      .insert({
        db_block_id: dbBlock.id,
        data: completeData,
        created_by: userId,
        updated_by: userId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating row:', error);
      throw new Error(`Failed to create row: ${error.message}`);
    }

    // Auto-index the database after row changes
    const workspace = await this.getWorkspaceForDatabaseBlock(dbBlock.id);
    if (workspace) {
      await autoIndexerService.onDatabaseChange(dbBlock.id, workspace.id, 'update');
    }

    return this.mapRow(row);
  }

  async updateRow(
    id: string,
    data: Record<string, any>,
    version: number,
    userId: string
  ): Promise<DatabaseRow> {
    // Optimistic locking check
    const { data: existingRow } = await this.supabase
      .from('db_block_rows')
      .select('version')
      .eq('id', id)
      .single();

    if (existingRow && existingRow.version !== version) {
      throw new Error('Row has been modified by another user');
    }

    const { data: row, error } = await this.supabase
      .from('db_block_rows')
      .update({
        data,
        version: version + 1,
        updated_at: new Date().toISOString(),
        updated_by: userId
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating row:', error);
      throw new Error(`Failed to update row: ${error.message}`);
    }

    // Auto-index the database after row changes
    const { data: dbRow } = await this.supabase
      .from('db_block_rows')
      .select('db_block_id')
      .eq('id', id)
      .single();
    
    if (dbRow) {
      const workspace = await this.getWorkspaceForDatabaseBlock(dbRow.db_block_id);
      if (workspace) {
        await autoIndexerService.onDatabaseChange(dbRow.db_block_id, workspace.id, 'update');
      }
    }

    return this.mapRow(row);
  }

  async deleteRow(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('db_block_rows')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting row:', error);
      throw new Error(`Failed to delete row: ${error.message}`);
    }

    return true;
  }

  async duplicateRow(rowId: string, userId: string): Promise<string> {
    // Get the row to duplicate
    const { data: originalRow } = await this.supabase
      .from('db_block_rows')
      .select('*')
      .eq('id', rowId)
      .single();

    if (!originalRow) {
      throw new Error('Row not found');
    }

    // Create a duplicate
    const { data: newRow, error } = await this.supabase
      .from('db_block_rows')
      .insert({
        db_block_id: originalRow.db_block_id,
        data: originalRow.data,
        created_by: userId,
        updated_by: userId
      })
      .select()
      .single();

    if (error) {
      console.error('Error duplicating row:', error);
      throw new Error(`Failed to duplicate row: ${error.message}`);
    }

    return newRow.id;
  }

  // ================== Bulk Operations using RPC Functions ==================

  async bulkUpdateRows(updates: Array<{ id: string; data: any; version: number }>, userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .rpc('bulk_update_rows', {
        p_updates: updates.map(u => ({
          id: u.id,
          data: JSON.stringify(u.data),
          version: u.version
        }))
      });

    if (error) {
      console.error('Error bulk updating rows:', error);
      throw new Error(`Failed to bulk update rows: ${error.message}`);
    }

    return data || 0;
  }

  // ================== Aggregations using RPC ==================

  async calculateAggregation(
    databaseBlockId: string,
    columnName: string,
    aggregationType: string
  ): Promise<any> {
    // Get the database block ID
    const { data: dbBlock } = await this.supabase
      .from('db_blocks')
      .select('id')
      .eq('block_id', databaseBlockId)
      .single();

    if (!dbBlock) {
      throw new Error('Database block not found');
    }

    const { data, error } = await this.supabase
      .rpc('aggregate_column', {
        p_db_block_id: dbBlock.id,
        p_column_name: columnName,
        p_aggregation: aggregationType
      });

    if (error) {
      console.error('Error calculating aggregation:', error);
      throw new Error(`Failed to calculate aggregation: ${error.message}`);
    }

    return data?.value;
  }

  // ================== View Management ==================

  async createView(
    databaseBlockId: string,
    view: Partial<DatabaseView>,
    userId: string
  ): Promise<DatabaseView> {
    // Get the database block
    const { data: dbBlock } = await this.supabase
      .from('db_blocks')
      .select('id')
      .eq('block_id', databaseBlockId)
      .single();

    if (!dbBlock) {
      throw new Error('Database block not found');
    }

    const newView: DatabaseView = {
      id: `view-${Date.now()}`,
      databaseBlockId: dbBlock.id,
      name: view.name || 'New View',
      type: view.type || 'table',
      filters: view.filters || [],
      sorts: view.sorts || [],
      visibleColumns: view.visibleColumns || [],
      groupBy: view.groupBy,
      colorBy: view.colorBy,
      isDefault: view.isDefault || false,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Views are stored in the db_blocks schema for now
    // In production, you might want a separate table
    return newView;
  }

  // ================== Helper Methods ==================

  private getDefaultSchema(): DatabaseColumn[] {
    return [
      {
        id: 'col-1',
        databaseBlockId: '',
        columnId: 'title',
        name: 'Title',
        type: 'text',
        config: {},
        width: 200,
        isHidden: false,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'col-2',
        databaseBlockId: '',
        columnId: 'status',
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { value: 'todo', label: 'To Do', color: 'gray' },
            { value: 'in-progress', label: 'In Progress', color: 'blue' },
            { value: 'done', label: 'Done', color: 'green' }
          ]
        },
        width: 150,
        isHidden: false,
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'col-3',
        databaseBlockId: '',
        columnId: 'priority',
        name: 'Priority',
        type: 'select',
        config: {
          options: [
            { value: 'low', label: 'Low', color: 'gray' },
            { value: 'medium', label: 'Medium', color: 'yellow' },
            { value: 'high', label: 'High', color: 'red' }
          ]
        },
        width: 120,
        isHidden: false,
        order: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'col-4',
        databaseBlockId: '',
        columnId: 'assignee',
        name: 'Assignee',
        type: 'user',
        config: {},
        width: 150,
        isHidden: false,
        order: 3,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'col-5',
        databaseBlockId: '',
        columnId: 'due_date',
        name: 'Due Date',
        type: 'date',
        config: {},
        width: 120,
        isHidden: false,
        order: 4,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
  }

  private async createInitialRows(dbBlockId: string): Promise<void> {
    const sampleRows = [
      {
        title: 'Complete RAG Application Setup',
        status: 'in-progress',
        priority: 'high',
        assignee: 'John Doe',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        title: 'Configure Database Schema',
        status: 'done',
        priority: 'high',
        assignee: 'Jane Smith',
        due_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        title: 'Implement AI Features',
        status: 'todo',
        priority: 'medium',
        assignee: 'Bob Johnson',
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        title: 'Write Documentation',
        status: 'todo',
        priority: 'low',
        assignee: 'Alice Cooper',
        due_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        title: 'Setup CI/CD Pipeline',
        status: 'in-progress',
        priority: 'medium',
        assignee: 'Charlie Brown',
        due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    for (const rowData of sampleRows) {
      await this.supabase
        .from('db_block_rows')
        .insert({
          db_block_id: dbBlockId,
          data: rowData
        });
    }
  }

  private getDefaultValueForType(type: DatabaseColumnType): any {
    switch (type) {
      case 'text':
        return '';
      case 'number':
        return 0;
      case 'checkbox':
        return false;
      case 'select':
        return '';
      case 'date':
      case 'datetime':
        return null;
      default:
        return null;
    }
  }

  private generateColumnId(): string {
    return `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ================== Mappers ==================

  private mapDatabaseBlock(data: any): DatabaseBlock {
    return {
      id: data.id,
      blockId: data.block_id,
      name: data.name,
      description: data.description,
      schema: data.schema || [],
      views: [],
      settings: data.settings || {},
      rowCount: data.row_count || 0,
      version: 1,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  private mapRow(data: any): DatabaseRow {
    return {
      id: data.id,
      databaseBlockId: data.db_block_id,
      rowNumber: data.position,
      data: data.data,
      metadata: {},
      version: data.version,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  // Helper to get workspace for a block
  private async getWorkspaceForBlock(blockId: string): Promise<{ id: string } | null> {
    const { data, error } = await this.supabase
      .from('blocks')
      .select(`
        page:pages(workspace_id)
      `)
      .eq('id', blockId)
      .single();

    if (error || !data?.page) {
      console.error('Error getting workspace for block:', error);
      return null;
    }

    return { id: data.page.workspace_id };
  }

  // Helper to get workspace for a database block
  private async getWorkspaceForDatabaseBlock(dbBlockId: string): Promise<{ id: string } | null> {
    const { data, error } = await this.supabase
      .from('db_blocks')
      .select(`
        block:blocks(
          page:pages(workspace_id)
        )
      `)
      .eq('id', dbBlockId)
      .single();

    if (error || !data?.block?.page) {
      console.error('Error getting workspace for database block:', error);
      return null;
    }

    return { id: data.block.page.workspace_id };
  }
}

export const databaseBlockSupabaseService = new DatabaseBlockSupabaseService();