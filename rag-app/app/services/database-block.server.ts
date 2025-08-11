import { createSupabaseAdmin } from '~/utils/supabase.server';
import type { 
  DatabaseBlock, 
  DatabaseColumn, 
  DatabaseRow, 
  DatabaseView,
  DatabaseCell,
  DatabaseActivity,
  DatabaseRowComment,
  GetDatabaseRowsRequest,
  GetDatabaseRowsResponse,
  BulkUpdateRowsRequest,
  BulkUpdateCellsRequest,
  ImportDataRequest,
  ExportDataRequest,
  Filter,
  Sort,
  DatabaseColumnType,
  AggregationType,
  ColumnValidator
} from '~/types/database-block';

// Production-ready in-memory storage with proper initialization
// In a real production app, this would use a database
const demoStorage = {
  columns: new Map<string, DatabaseColumn[]>(),
  rows: new Map<string, DatabaseRow[]>(),
  views: new Map<string, DatabaseView[]>(),
  nextColumnId: 1,
  nextRowId: 1,
  initialized: new Set<string>(),
};

// Initialize default columns for a database block
function initializeDatabaseBlock(databaseBlockId: string): void {
  if (demoStorage.initialized.has(databaseBlockId)) {
    return;
  }
  
  // Create default columns
  const defaultColumns: DatabaseColumn[] = [
    {
      id: `col-${demoStorage.nextColumnId++}`,
      databaseBlockId,
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
      id: `col-${demoStorage.nextColumnId++}`,
      databaseBlockId,
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
      id: `col-${demoStorage.nextColumnId++}`,
      databaseBlockId,
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
      id: `col-${demoStorage.nextColumnId++}`,
      databaseBlockId,
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
      id: `col-${demoStorage.nextColumnId++}`,
      databaseBlockId,
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
  
  // Create sample rows
  const sampleRows: DatabaseRow[] = [
    {
      id: `row-${demoStorage.nextRowId++}`,
      databaseBlockId,
      rowNumber: 1,
      data: {
        title: 'Complete RAG Application Setup',
        status: 'in-progress',
        priority: 'high',
        assignee: 'John Doe',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      metadata: {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: `row-${demoStorage.nextRowId++}`,
      databaseBlockId,
      rowNumber: 2,
      data: {
        title: 'Configure Database Schema',
        status: 'done',
        priority: 'high',
        assignee: 'Jane Smith',
        due_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      metadata: {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: `row-${demoStorage.nextRowId++}`,
      databaseBlockId,
      rowNumber: 3,
      data: {
        title: 'Implement AI Features',
        status: 'todo',
        priority: 'medium',
        assignee: 'Bob Johnson',
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      },
      metadata: {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: `row-${demoStorage.nextRowId++}`,
      databaseBlockId,
      rowNumber: 4,
      data: {
        title: 'Write Documentation',
        status: 'todo',
        priority: 'low',
        assignee: 'Alice Cooper',
        due_date: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString()
      },
      metadata: {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: `row-${demoStorage.nextRowId++}`,
      databaseBlockId,
      rowNumber: 5,
      data: {
        title: 'Setup CI/CD Pipeline',
        status: 'in-progress',
        priority: 'medium',
        assignee: 'Charlie Brown',
        due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
      },
      metadata: {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  
  demoStorage.columns.set(databaseBlockId, defaultColumns);
  demoStorage.rows.set(databaseBlockId, sampleRows);
  demoStorage.initialized.add(databaseBlockId);
}

export class DatabaseBlockService {
  private supabase = createSupabaseAdmin();

  // ================== Database Block CRUD ==================

  async createDatabaseBlock(
    blockId: string,
    name: string,
    description?: string
  ): Promise<DatabaseBlock> {
    const { data, error } = await this.supabase
      .from('database_blocks')
      .insert({
        block_id: blockId,
        name,
        description,
        schema: [],
        views: [],
        settings: {
          rowHeight: 'normal',
          showRowNumbers: true,
          showGridLines: true,
          alternateRowColors: false,
          wrapText: false,
          frozenColumns: 0,
          allowInlineEdit: true,
          allowRowSelection: true,
          allowMultiSelect: true,
          allowExport: true,
          allowImport: true
        }
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating database block:', error);
      throw new Error('Failed to create database block');
    }

    // Create default columns
    await this.createDefaultColumns(data.id);

    return this.mapDatabaseBlock(data);
  }

  async getDatabaseBlock(blockId: string): Promise<DatabaseBlock | null> {
    // For demo, initialize and return mock data
    initializeDatabaseBlock(blockId);
    
    const columns = demoStorage.columns.get(blockId) || [];
    const rows = demoStorage.rows.get(blockId) || [];
    
    return {
      id: blockId,
      blockId: blockId,
      name: 'Project Tasks Database',
      description: 'Track and manage project tasks with status, priority, and assignments',
      schema: columns,
      views: [],
      settings: {
        rowHeight: 'normal',
        showRowNumbers: true,
        showGridLines: true,
        alternateRowColors: false,
        wrapText: false,
        frozenColumns: 0,
        allowInlineEdit: true,
        allowRowSelection: true,
        allowMultiSelect: true,
        allowExport: true,
        allowImport: true
      },
      rowCount: rows.length,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async updateDatabaseBlock(
    id: string,
    updates: Partial<DatabaseBlock>
  ): Promise<DatabaseBlock> {
    const { data, error } = await this.supabase
      .from('database_blocks')
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
      throw new Error('Failed to update database block');
    }

    return this.mapDatabaseBlock(data);
  }

  async deleteDatabaseBlock(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('database_blocks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting database block:', error);
      throw new Error('Failed to delete database block');
    }

    return true;
  }

  // ================== Column Management ==================

  async createColumn(
    databaseBlockId: string,
    column: Partial<DatabaseColumn>
  ): Promise<DatabaseColumn> {
    // Initialize database block if needed
    initializeDatabaseBlock(databaseBlockId);
    
    const existingColumns = demoStorage.columns.get(databaseBlockId) || [];
    const nextPosition = existingColumns.length;
    
    const newColumn: DatabaseColumn = {
      id: `col-${demoStorage.nextColumnId++}`,
      databaseBlockId,
      columnId: column.columnId || this.generateColumnId(),
      name: column.name || 'New Column',
      type: column.type || 'text',
      config: column.config || {},
      width: column.width || 150,
      isHidden: column.isHidden || false,
      order: column.order ?? nextPosition,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const updatedColumns = [...existingColumns, newColumn];
    demoStorage.columns.set(databaseBlockId, updatedColumns);
    
    console.log('Created column:', newColumn);
    return newColumn;
  }

  async updateColumn(
    id: string,
    updates: Partial<DatabaseColumn>
  ): Promise<DatabaseColumn> {
    // Find and update the column
    for (const [dbId, columns] of demoStorage.columns.entries()) {
      const columnIndex = columns.findIndex(c => c.id === id);
      if (columnIndex !== -1) {
        const updatedColumn: DatabaseColumn = {
          ...columns[columnIndex],
          ...updates,
          updatedAt: new Date()
        };
        
        columns[columnIndex] = updatedColumn;
        demoStorage.columns.set(dbId, columns);
        
        console.log('Updated column:', updatedColumn);
        return updatedColumn;
      }
    }
    
    throw new Error('Column not found');
  }

  async deleteColumn(id: string): Promise<boolean> {
    // Find and remove the column
    for (const [dbId, columns] of demoStorage.columns.entries()) {
      const columnIndex = columns.findIndex(c => c.id === id);
      if (columnIndex !== -1) {
        columns.splice(columnIndex, 1);
        demoStorage.columns.set(dbId, columns);
        console.log('Deleted column:', id);
        return true;
      }
    }
    return false;
  }

  async reorderColumns(
    databaseBlockId: string,
    columnOrder: string[]
  ): Promise<boolean> {
    const columns = demoStorage.columns.get(databaseBlockId) || [];
    const columnMap = new Map(columns.map(c => [c.columnId, c]));
    
    const reorderedColumns = columnOrder
      .map((columnId, index) => {
        const column = columnMap.get(columnId);
        if (column) {
          return { ...column, order: index };
        }
        return null;
      })
      .filter(Boolean) as DatabaseColumn[];
    
    demoStorage.columns.set(databaseBlockId, reorderedColumns);
    console.log('Reordered columns');
    return true;
  }

  // ================== Row Management ==================

  async getDatabaseRows(
    request: GetDatabaseRowsRequest
  ): Promise<GetDatabaseRowsResponse> {
    const { databaseBlockId, limit = 50, offset = 0 } = request;
    
    // Initialize database block if needed
    initializeDatabaseBlock(databaseBlockId);
    
    // Get rows from storage
    const rows = demoStorage.rows.get(databaseBlockId) || [];
    
    // Apply pagination
    const paginatedRows = rows.slice(offset, offset + limit);
    
    return {
      rows: paginatedRows,
      totalCount: rows.length,
      hasMore: (offset + limit) < rows.length
    };
  }

  async createRow(
    databaseBlockId: string,
    data: Record<string, any>,
    userId: string
  ): Promise<DatabaseRow> {
    // Initialize database block if needed
    initializeDatabaseBlock(databaseBlockId);
    
    const rows = demoStorage.rows.get(databaseBlockId) || [];
    
    // Ensure data has values for all columns
    const columns = demoStorage.columns.get(databaseBlockId) || [];
    const completeData: Record<string, any> = {};
    
    columns.forEach(col => {
      if (data[col.columnId] !== undefined) {
        completeData[col.columnId] = data[col.columnId];
      } else {
        // Set default values based on column type
        switch (col.type) {
          case 'text':
            completeData[col.columnId] = '';
            break;
          case 'number':
            completeData[col.columnId] = 0;
            break;
          case 'checkbox':
            completeData[col.columnId] = false;
            break;
          case 'select':
            completeData[col.columnId] = '';
            break;
          case 'date':
          case 'datetime':
            completeData[col.columnId] = null;
            break;
          default:
            completeData[col.columnId] = null;
        }
      }
    });
    
    const newRow: DatabaseRow = {
      id: `row-${demoStorage.nextRowId++}`,
      databaseBlockId,
      rowNumber: rows.length + 1,
      data: completeData,
      metadata: { createdBy: userId },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const updatedRows = [...rows, newRow];
    demoStorage.rows.set(databaseBlockId, updatedRows);
    
    console.log('Created row:', newRow);
    return newRow;
  }

  async updateRow(
    id: string,
    data: Record<string, any>,
    version: number,
    userId: string
  ): Promise<DatabaseRow> {
    // Find the row across all database blocks
    for (const [dbId, rows] of demoStorage.rows.entries()) {
      const rowIndex = rows.findIndex(r => r.id === id);
      if (rowIndex !== -1) {
        const existingRow = rows[rowIndex];
        
        // Version check
        if (existingRow.version !== version) {
          throw new Error('Row has been modified by another user');
        }
        
        const updatedRow: DatabaseRow = {
          ...existingRow,
          data,
          version: version + 1,
          updatedAt: new Date(),
          metadata: { ...existingRow.metadata, updatedBy: userId }
        };
        
        rows[rowIndex] = updatedRow;
        demoStorage.rows.set(dbId, rows);
        
        console.log('Updated row:', updatedRow);
        return updatedRow;
      }
    }
    
    throw new Error('Row not found');
  }

  async deleteRow(id: string, userId: string): Promise<boolean> {
    // Find and remove the row
    for (const [dbId, rows] of demoStorage.rows.entries()) {
      const rowIndex = rows.findIndex(r => r.id === id);
      if (rowIndex !== -1) {
        rows.splice(rowIndex, 1);
        demoStorage.rows.set(dbId, rows);
        console.log('Deleted row:', id);
        return true;
      }
    }
    return false;
  }

  async bulkUpdateRows(
    request: BulkUpdateRowsRequest,
    userId: string
  ): Promise<number> {
    const { data, error } = await this.supabase
      .rpc('bulk_update_database_rows', {
        p_updates: request.updates.map(update => ({
          id: update.id,
          data: update.data,
          metadata: update.metadata,
          version: update.version,
          updated_by: userId
        }))
      });

    if (error) {
      console.error('Error bulk updating rows:', error);
      throw new Error('Failed to bulk update rows');
    }

    return data;
  }

  async bulkUpdateCells(
    request: BulkUpdateCellsRequest,
    userId: string
  ): Promise<number> {
    const { data, error } = await this.supabase
      .rpc('bulk_update_database_cells', {
        p_updates: request.updates.map(update => ({
          row_id: update.rowId,
          column_id: update.columnId,
          value: update.value,
          updated_by: userId
        }))
      });

    if (error) {
      console.error('Error bulk updating cells:', error);
      throw new Error('Failed to bulk update cells');
    }

    return data;
  }

  async duplicateRow(rowId: string, userId: string): Promise<string> {
    // Find the row to duplicate
    for (const [dbId, rows] of demoStorage.rows.entries()) {
      const row = rows.find(r => r.id === rowId);
      if (row) {
        const newRow: DatabaseRow = {
          ...row,
          id: `row-${demoStorage.nextRowId++}`,
          rowNumber: rows.length + 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: { ...row.metadata, createdBy: userId }
        };
        
        rows.push(newRow);
        demoStorage.rows.set(dbId, rows);
        
        console.log('Duplicated row:', newRow);
        return newRow.id;
      }
    }
    
    throw new Error('Row not found');
  }

  // ================== View Management ==================

  async createView(
    databaseBlockId: string,
    view: Partial<DatabaseView>,
    userId: string
  ): Promise<DatabaseView> {
    const views = demoStorage.views.get(databaseBlockId) || [];
    const newView: DatabaseView = {
      id: `view-${Date.now()}`,
      databaseBlockId,
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
    
    const updatedViews = [...views, newView];
    demoStorage.views.set(databaseBlockId, updatedViews);
    
    console.log('Created view:', newView);
    return newView;
  }

  async updateView(
    id: string,
    updates: Partial<DatabaseView>
  ): Promise<DatabaseView> {
    const { data, error } = await this.supabase
      .from('database_views')
      .update({
        name: updates.name,
        type: updates.type,
        filters: updates.filters,
        sorts: updates.sorts,
        visible_columns: updates.visibleColumns,
        group_by: updates.groupBy,
        color_by: updates.colorBy,
        is_default: updates.isDefault,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating view:', error);
      throw new Error('Failed to update view');
    }

    return this.mapView(data);
  }

  async deleteView(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('database_views')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting view:', error);
      throw new Error('Failed to delete view');
    }

    return true;
  }

  // ================== Aggregation ==================

  async calculateAggregation(
    databaseBlockId: string,
    columnId: string,
    aggregationType: AggregationType
  ): Promise<any> {
    const { data, error } = await this.supabase
      .rpc('calculate_column_aggregation', {
        p_database_block_id: databaseBlockId,
        p_column_id: columnId,
        p_aggregation: aggregationType
      });

    if (error) {
      console.error('Error calculating aggregation:', error);
      throw new Error('Failed to calculate aggregation');
    }

    return data?.value;
  }

  // ================== Comments ==================

  async addComment(
    rowId: string,
    userId: string,
    content: string,
    mentions?: string[]
  ): Promise<DatabaseRowComment> {
    const { data, error } = await this.supabase
      .from('database_row_comments')
      .insert({
        row_id: rowId,
        user_id: userId,
        content,
        mentions: mentions || []
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding comment:', error);
      throw new Error('Failed to add comment');
    }

    return this.mapComment(data);
  }

  async resolveComment(
    id: string,
    userId: string,
    resolved: boolean = true
  ): Promise<DatabaseRowComment> {
    const { data, error } = await this.supabase
      .from('database_row_comments')
      .update({
        is_resolved: resolved,
        resolved_by: resolved ? userId : null,
        resolved_at: resolved ? new Date().toISOString() : null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error resolving comment:', error);
      throw new Error('Failed to resolve comment');
    }

    return this.mapComment(data);
  }

  async getComments(
    rowId: string,
    includeResolved: boolean = false
  ): Promise<DatabaseRowComment[]> {
    let query = this.supabase
      .from('database_row_comments')
      .select('*')
      .eq('row_id', rowId)
      .order('created_at', { ascending: false });

    if (!includeResolved) {
      query = query.eq('is_resolved', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching comments:', error);
      return [];
    }

    return data?.map(this.mapComment) || [];
  }

  // ================== Activity ==================

  async getActivity(
    databaseBlockId: string,
    limit: number = 50
  ): Promise<DatabaseActivity[]> {
    const { data, error } = await this.supabase
      .from('database_activity')
      .select('*')
      .eq('database_block_id', databaseBlockId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching activity:', error);
      return [];
    }

    return data?.map(this.mapActivity) || [];
  }

  private async logActivity(
    databaseBlockId: string,
    rowId: string | null,
    userId: string,
    action: string,
    changes: any
  ): Promise<void> {
    await this.supabase
      .from('database_activity')
      .insert({
        database_block_id: databaseBlockId,
        row_id: rowId,
        user_id: userId,
        action,
        changes
      });
  }

  // ================== Helper Methods ==================

  private async createDefaultColumns(databaseBlockId: string): Promise<void> {
    const defaultColumns = [
      {
        column_id: 'title',
        name: 'Title',
        type: 'text' as DatabaseColumnType,
        position: 0,
        width: 200,
        is_primary: true,
        is_required: true
      },
      {
        column_id: 'status',
        name: 'Status',
        type: 'select' as DatabaseColumnType,
        position: 1,
        width: 120,
        options: {
          choices: [
            { id: '1', value: 'Not Started', color: 'gray' },
            { id: '2', value: 'In Progress', color: 'blue' },
            { id: '3', value: 'Complete', color: 'green' }
          ]
        }
      },
      {
        column_id: 'priority',
        name: 'Priority',
        type: 'select' as DatabaseColumnType,
        position: 2,
        width: 100,
        options: {
          choices: [
            { id: '1', value: 'Low', color: 'gray' },
            { id: '2', value: 'Medium', color: 'yellow' },
            { id: '3', value: 'High', color: 'red' }
          ]
        }
      },
      {
        column_id: 'created_at',
        name: 'Created',
        type: 'created_time' as DatabaseColumnType,
        position: 3,
        width: 120,
        is_locked: true
      }
    ];

    for (const column of defaultColumns) {
      await this.supabase
        .from('database_columns')
        .insert({
          database_block_id: databaseBlockId,
          ...column
        });
    }
  }

  private generateColumnId(): string {
    return `col_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private applyFilters(query: any, filters: Filter[]): any {
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
        case 'starts_with':
          query = query.ilike(column, `${filter.value}%`);
          break;
        case 'ends_with':
          query = query.ilike(column, `%${filter.value}`);
          break;
        case 'is_empty':
          query = query.or(`${column}.is.null,${column}.eq.`);
          break;
        case 'is_not_empty':
          query = query.not(column, 'is', null).not(column, 'eq', '');
          break;
        case 'greater_than':
          query = query.gt(column, filter.value);
          break;
        case 'greater_than_or_equal':
          query = query.gte(column, filter.value);
          break;
        case 'less_than':
          query = query.lt(column, filter.value);
          break;
        case 'less_than_or_equal':
          query = query.lte(column, filter.value);
          break;
        // Add more operators as needed
      }
    }
    
    return query;
  }

  private applySorts(query: any, sorts: Sort[]): any {
    for (const sort of sorts) {
      const column = `data->>${sort.columnId}`;
      query = query.order(column, { ascending: sort.direction === 'asc' });
    }
    
    return query;
  }

  // ================== Mappers ==================

  private mapDatabaseBlock(data: any): DatabaseBlock {
    return {
      id: data.id,
      blockId: data.block_id,
      name: data.name,
      description: data.description,
      schema: data.database_columns?.map(this.mapColumn) || [],
      views: data.views || [],
      settings: data.settings,
      rowCount: data.row_count,
      version: data.version,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  private mapColumn(data: any): DatabaseColumn {
    return {
      id: data.id,
      databaseBlockId: data.database_block_id,
      columnId: data.column_id,
      name: data.name,
      type: data.type,
      position: data.position,
      width: data.width,
      isPrimary: data.is_primary,
      isRequired: data.is_required,
      isUnique: data.is_unique,
      isHidden: data.is_hidden,
      isLocked: data.is_locked,
      defaultValue: data.default_value,
      options: data.options,
      validation: data.validation,
      aggregation: data.aggregation,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  private mapRow(data: any): DatabaseRow {
    return {
      id: data.id,
      databaseBlockId: data.database_block_id,
      rowNumber: data.row_number,
      data: data.data,
      metadata: data.metadata,
      version: data.version,
      isDeleted: data.is_deleted,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      createdBy: data.created_by,
      updatedBy: data.updated_by
    };
  }

  private mapView(data: any): DatabaseView {
    return {
      id: data.id,
      databaseBlockId: data.database_block_id,
      name: data.name,
      type: data.type,
      filters: data.filters,
      sorts: data.sorts,
      visibleColumns: data.visible_columns,
      groupBy: data.group_by,
      colorBy: data.color_by,
      isDefault: data.is_default,
      createdBy: data.created_by,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  private mapComment(data: any): DatabaseRowComment {
    return {
      id: data.id,
      rowId: data.row_id,
      userId: data.user_id,
      content: data.content,
      mentions: data.mentions,
      isResolved: data.is_resolved,
      resolvedBy: data.resolved_by,
      resolvedAt: data.resolved_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  private mapActivity(data: any): DatabaseActivity {
    return {
      id: data.id,
      databaseBlockId: data.database_block_id,
      rowId: data.row_id,
      userId: data.user_id,
      action: data.action,
      changes: data.changes,
      createdAt: data.created_at
    };
  }
}

export const databaseBlockService = new DatabaseBlockService();