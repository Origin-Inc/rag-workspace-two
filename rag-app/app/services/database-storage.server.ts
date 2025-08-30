// Database Storage Optimization Service
// Handles JSONB compression, indexing, and storage patterns for large datasets

import { createSupabaseAdmin } from '~/utils/supabase.server';
import type { DatabaseColumnCore, DatabaseRowCore } from '~/types/database-block-core';
import { databaseSchemaService } from './database-schema.server';

export interface StorageOptimizationConfig {
  enableCompression: boolean;
  enablePartitioning: boolean;
  enableSeparateTables: boolean;
  compressionThreshold: number; // Size in KB
  separateTableThreshold: number; // Size in KB
}

export interface StorageMetrics {
  totalSize: number;
  compressedSize: number;
  compressionRatio: number;
  indexCount: number;
  partitionCount: number;
  avgRowSize: number;
  largeColumns: string[];
}

export class DatabaseStorageService {
  private config: StorageOptimizationConfig = {
    enableCompression: true,
    enablePartitioning: true,
    enableSeparateTables: true,
    compressionThreshold: 10, // 10KB
    separateTableThreshold: 100 // 100KB
  };

  /**
   * Compress JSONB data for storage
   */
  compressData(data: Record<string, any>, schema: DatabaseColumnCore[]): {
    compressed: Record<string, any>;
    metadata: Record<string, any>;
  } {
    const compressed: Record<string, any> = {};
    const metadata: Record<string, any> = {
      originalSize: 0,
      compressedSize: 0,
      compressionRatio: 1
    };

    const optimizations = databaseSchemaService.getStorageOptimizations(schema);
    
    for (const [key, value] of Object.entries(data)) {
      const column = schema.find(c => c.id === key);
      if (!column) {
        compressed[key] = value;
        continue;
      }

      // Check if column should be compressed
      if (optimizations.compressColumns.includes(key)) {
        const originalSize = JSON.stringify(value).length;
        
        if (originalSize > this.config.compressionThreshold * 1024) {
          // Apply compression strategies based on type
          compressed[key] = this.compressValue(value, column);
          metadata.originalSize += originalSize;
          metadata.compressedSize += JSON.stringify(compressed[key]).length;
        } else {
          compressed[key] = value;
        }
      } else {
        compressed[key] = value;
      }
    }

    if (metadata.originalSize > 0) {
      metadata.compressionRatio = metadata.originalSize / metadata.compressedSize;
    }

    return { compressed, metadata };
  }

  /**
   * Compress a single value based on column type
   */
  private compressValue(value: any, column: DatabaseColumnCore): any {
    switch (column.type) {
      case 'rich_text':
        // Remove unnecessary whitespace and formatting
        if (typeof value === 'string') {
          return value
            .replace(/\s+/g, ' ')
            .replace(/>\s+</g, '><')
            .trim();
        }
        break;
        
      case 'multi_select':
        // Store as array of IDs only (labels can be looked up)
        if (Array.isArray(value)) {
          return value.filter(Boolean);
        }
        break;
        
      case 'files':
        // Store only essential file metadata
        if (Array.isArray(value)) {
          return value.map(f => ({
            id: f.id,
            name: f.name,
            url: f.url,
            size: f.size
            // Omit optional metadata
          }));
        }
        break;
    }
    
    return value;
  }

  /**
   * Create optimized indexes for a database block
   */
  async createIndexes(
    blockId: string,
    schema: DatabaseColumnCore[]
  ): Promise<{ created: number; failed: string[] }> {
    const supabase = createSupabaseAdmin();
    const indexDefinitions = databaseSchemaService.generateIndexDefinitions(blockId, schema);
    
    let created = 0;
    const failed: string[] = [];
    
    for (const indexDef of indexDefinitions) {
      try {
        await supabase.rpc('execute_sql', { query: indexDef });
        created++;
      } catch (error) {
        console.error(`Failed to create index: ${error}`);
        failed.push(indexDef);
      }
    }
    
    // Create composite indexes for common query patterns
    const compositeIndexes = this.generateCompositeIndexes(blockId, schema);
    for (const indexDef of compositeIndexes) {
      try {
        await supabase.rpc('execute_sql', { query: indexDef });
        created++;
      } catch (error) {
        console.error(`Failed to create composite index: ${error}`);
        failed.push(indexDef);
      }
    }
    
    return { created, failed };
  }

  /**
   * Generate composite indexes for common query patterns
   */
  private generateCompositeIndexes(blockId: string, schema: DatabaseColumnCore[]): string[] {
    const indexes: string[] = [];
    
    // Index for sorting by created_time
    const hasCreatedTime = schema.some(c => c.type === 'created_time');
    if (hasCreatedTime) {
      indexes.push(
        `CREATE INDEX IF NOT EXISTS idx_${blockId}_created_sort 
         ON db_block_rows_partitioned(db_block_id, (data->>'created_time') DESC) 
         WHERE db_block_id = '${blockId}'`
      );
    }
    
    // Index for filtering by status + sorting
    const hasStatus = schema.some(c => c.id === 'status');
    if (hasStatus) {
      indexes.push(
        `CREATE INDEX IF NOT EXISTS idx_${blockId}_status_position 
         ON db_block_rows_partitioned(db_block_id, (data->>'status'), position) 
         WHERE db_block_id = '${blockId}'`
      );
    }
    
    // Full-text search index for text columns
    const textColumns = schema.filter(c => c.type === 'text' || c.type === 'rich_text');
    if (textColumns.length > 0) {
      const textPaths = textColumns.map(c => `(data->>'${c.id}')`).join(' || \' \' || ');
      indexes.push(
        `CREATE INDEX IF NOT EXISTS idx_${blockId}_text_search 
         ON db_block_rows_partitioned USING gin(to_tsvector('english', ${textPaths})) 
         WHERE db_block_id = '${blockId}'`
      );
    }
    
    return indexes;
  }

  /**
   * Move large column data to separate table
   */
  async separateLargeColumns(
    blockId: string,
    rowId: string,
    data: Record<string, any>,
    schema: DatabaseColumnCore[]
  ): Promise<{
    coreData: Record<string, any>;
    separatedColumns: string[];
  }> {
    const supabase = createSupabaseAdmin();
    const optimizations = databaseSchemaService.getStorageOptimizations(schema);
    
    const coreData: Record<string, any> = {};
    const separatedColumns: string[] = [];
    
    for (const [key, value] of Object.entries(data)) {
      const size = JSON.stringify(value).length;
      
      if (optimizations.separateColumns.includes(key) && 
          size > this.config.separateTableThreshold * 1024) {
        // Store in separate table
        await supabase
          .from('db_block_large_data')
          .upsert({
            block_id: blockId,
            row_id: rowId,
            column_id: key,
            data: value
          });
        
        // Store reference in core data
        coreData[key] = { __ref: 'large_data', column_id: key };
        separatedColumns.push(key);
      } else {
        coreData[key] = value;
      }
    }
    
    return { coreData, separatedColumns };
  }

  /**
   * Retrieve separated large column data
   */
  async retrieveLargeColumns(
    blockId: string,
    rowIds: string[]
  ): Promise<Map<string, Record<string, any>>> {
    const supabase = createSupabaseAdmin();
    
    const { data } = await supabase
      .from('db_block_large_data')
      .select('row_id, column_id, data')
      .eq('block_id', blockId)
      .in('row_id', rowIds);
    
    const largeData = new Map<string, Record<string, any>>();
    
    if (data) {
      for (const item of data) {
        if (!largeData.has(item.row_id)) {
          largeData.set(item.row_id, {});
        }
        largeData.get(item.row_id)![item.column_id] = item.data;
      }
    }
    
    return largeData;
  }

  /**
   * Analyze storage metrics for a database block
   */
  async analyzeStorageMetrics(blockId: string): Promise<StorageMetrics> {
    const supabase = createSupabaseAdmin();
    
    // Get table size metrics
    const { data: sizeData } = await supabase.rpc('execute_sql', {
      query: `
        SELECT 
          pg_size_pretty(SUM(pg_column_size(data))) as total_size,
          AVG(pg_column_size(data)) as avg_row_size,
          COUNT(*) as row_count
        FROM db_block_rows_partitioned
        WHERE db_block_id = $1
      `,
      params: [blockId]
    });
    
    // Get index count
    const { data: indexData } = await supabase.rpc('execute_sql', {
      query: `
        SELECT COUNT(*) as index_count
        FROM pg_indexes
        WHERE tablename = 'db_block_rows_partitioned'
        AND indexname LIKE $1
      `,
      params: [`%${blockId}%`]
    });
    
    // Get partition info
    const { data: partitionData } = await supabase.rpc('execute_sql', {
      query: `
        SELECT COUNT(DISTINCT hashtext(db_block_id::text)) as partition_count
        FROM db_block_rows_partitioned
        WHERE db_block_id = $1
      `,
      params: [blockId]
    });
    
    // Identify large columns
    const { data: largeColumnData } = await supabase.rpc('execute_sql', {
      query: `
        SELECT 
          jsonb_object_keys(data) as column_name,
          AVG(pg_column_size(data->jsonb_object_keys(data))) as avg_size
        FROM db_block_rows_partitioned
        WHERE db_block_id = $1
        GROUP BY jsonb_object_keys(data)
        HAVING AVG(pg_column_size(data->jsonb_object_keys(data))) > 1024
        ORDER BY avg_size DESC
      `,
      params: [blockId]
    });
    
    return {
      totalSize: sizeData?.[0]?.total_size || 0,
      compressedSize: 0, // Would need actual compression metrics
      compressionRatio: 1,
      indexCount: indexData?.[0]?.index_count || 0,
      partitionCount: partitionData?.[0]?.partition_count || 1,
      avgRowSize: sizeData?.[0]?.avg_row_size || 0,
      largeColumns: largeColumnData?.map((r: any) => r.column_name) || []
    };
  }

  /**
   * Optimize storage for an existing database block
   */
  async optimizeStorage(blockId: string): Promise<{
    optimized: boolean;
    actions: string[];
  }> {
    const supabase = createSupabaseAdmin();
    const actions: string[] = [];
    
    try {
      // VACUUM the partitioned table
      await supabase.rpc('execute_sql', {
        query: `VACUUM ANALYZE db_block_rows_partitioned`
      });
      actions.push('Performed VACUUM ANALYZE');
      
      // Reindex if needed
      const metrics = await this.analyzeStorageMetrics(blockId);
      if (metrics.avgRowSize > 10240) { // > 10KB average
        await supabase.rpc('execute_sql', {
          query: `REINDEX TABLE db_block_rows_partitioned`
        });
        actions.push('Reindexed table');
      }
      
      // Update table statistics
      await supabase.rpc('execute_sql', {
        query: `ANALYZE db_block_rows_partitioned`
      });
      actions.push('Updated table statistics');
      
      return { optimized: true, actions };
    } catch (error) {
      console.error('Storage optimization failed:', error);
      return { optimized: false, actions };
    }
  }

  /**
   * Batch import optimization
   */
  prepareBatchImport(
    rows: any[],
    schema: DatabaseColumnCore[]
  ): {
    optimizedRows: any[];
    compressionStats: any;
  } {
    const optimizedRows: any[] = [];
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    
    for (const row of rows) {
      const { compressed, metadata } = this.compressData(row, schema);
      optimizedRows.push(compressed);
      totalOriginalSize += metadata.originalSize;
      totalCompressedSize += metadata.compressedSize;
    }
    
    return {
      optimizedRows,
      compressionStats: {
        originalSize: totalOriginalSize,
        compressedSize: totalCompressedSize,
        compressionRatio: totalOriginalSize > 0 ? totalOriginalSize / totalCompressedSize : 1,
        rowCount: rows.length
      }
    };
  }
}

export const databaseStorageService = new DatabaseStorageService();