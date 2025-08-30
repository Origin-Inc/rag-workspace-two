/**
 * Database Block Index Optimization Service
 * 
 * Creates and manages database indexes for optimal query performance
 * with 50,000+ records
 */

import { prisma } from '~/utils/db.server';

export class DatabaseBlockIndexService {
  /**
   * Create all necessary indexes for database blocks
   * This should be run during application initialization or migration
   */
  static async createIndexes(): Promise<void> {
    console.log('Creating database block performance indexes...');
    
    try {
      // Create indexes using raw SQL for better control
      const indexQueries = [
        // Primary lookup indexes
        `CREATE INDEX IF NOT EXISTS idx_database_blocks_workspace_id 
         ON "DatabaseBlock"(workspace_id) 
         WHERE deleted_at IS NULL`,
        
        `CREATE INDEX IF NOT EXISTS idx_database_blocks_page_id 
         ON "DatabaseBlock"(page_id) 
         WHERE deleted_at IS NULL`,
        
        // Row lookup indexes
        `CREATE INDEX IF NOT EXISTS idx_database_rows_block_id_position 
         ON "DatabaseRow"(block_id, position) 
         WHERE deleted_at IS NULL`,
        
        `CREATE INDEX IF NOT EXISTS idx_database_rows_block_id_created 
         ON "DatabaseRow"(block_id, created_at DESC) 
         WHERE deleted_at IS NULL`,
        
        // JSONB indexes for cells data (GIN index for containment queries)
        `CREATE INDEX IF NOT EXISTS idx_database_rows_cells_gin 
         ON "DatabaseRow" USING GIN(cells) 
         WHERE deleted_at IS NULL`,
        
        // Partial index for recently updated rows (most queries are for recent data)
        `CREATE INDEX IF NOT EXISTS idx_database_rows_recent 
         ON "DatabaseRow"(block_id, updated_at DESC) 
         WHERE updated_at > NOW() - INTERVAL '7 days' AND deleted_at IS NULL`,
        
        // Column metadata indexes
        `CREATE INDEX IF NOT EXISTS idx_database_columns_block_id_position 
         ON "DatabaseColumn"(block_id, position) 
         WHERE deleted_at IS NULL`,
        
        // Formula and relation columns (for dependency tracking)
        `CREATE INDEX IF NOT EXISTS idx_database_columns_formula 
         ON "DatabaseColumn"(block_id) 
         WHERE type IN ('formula', 'rollup', 'relation') AND deleted_at IS NULL`,
        
        // View configuration indexes
        `CREATE INDEX IF NOT EXISTS idx_database_views_block_id 
         ON "DatabaseView"(block_id) 
         WHERE deleted_at IS NULL`,
        
        // Filter and sort configuration (stored as JSONB)
        `CREATE INDEX IF NOT EXISTS idx_database_views_filters_gin 
         ON "DatabaseView" USING GIN(filters) 
         WHERE deleted_at IS NULL`,
        
        // Performance tracking indexes
        `CREATE INDEX IF NOT EXISTS idx_database_block_stats 
         ON "DatabaseBlockStats"(block_id, created_at DESC)`,
        
        // Full-text search index for text columns
        `CREATE INDEX IF NOT EXISTS idx_database_rows_search 
         ON "DatabaseRow" USING GIN(to_tsvector('english', cells::text)) 
         WHERE deleted_at IS NULL`,
        
        // Composite index for filtered queries with sorting
        `CREATE INDEX IF NOT EXISTS idx_database_rows_composite 
         ON "DatabaseRow"(block_id, deleted_at, position) 
         INCLUDE (cells, created_at, updated_at)`,
        
        // Index for pagination with cursor-based navigation
        `CREATE INDEX IF NOT EXISTS idx_database_rows_cursor 
         ON "DatabaseRow"(block_id, id) 
         WHERE deleted_at IS NULL`
      ];

      // Execute all index creation queries
      for (const query of indexQueries) {
        await prisma.$executeRawUnsafe(query);
      }

      // Analyze tables to update statistics for query planner
      await this.analyzeTabl
es();
      
      console.log('Database block indexes created successfully');
    } catch (error) {
      console.error('Error creating indexes:', error);
      throw error;
    }
  }

  /**
   * Drop unused indexes to reduce storage and write overhead
   */
  static async dropUnusedIndexes(): Promise<string[]> {
    const droppedIndexes: string[] = [];
    
    try {
      // Query to find unused indexes (PostgreSQL specific)
      const unusedIndexes = await prisma.$queryRaw<Array<{ indexname: string; index_size: string }>>`
        SELECT 
          indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes
        WHERE 
          schemaname = 'public'
          AND idx_scan = 0
          AND indexrelname NOT LIKE 'pk_%'
          AND indexrelname NOT LIKE '%_pkey'
          AND idx_tup_read = 0
          AND indexrelname LIKE 'idx_database_%'
      `;

      for (const index of unusedIndexes) {
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS ${index.indexname}`);
        droppedIndexes.push(index.indexname);
        console.log(`Dropped unused index: ${index.indexname} (size: ${index.index_size})`);
      }
    } catch (error) {
      console.error('Error dropping unused indexes:', error);
    }
    
    return droppedIndexes;
  }

  /**
   * Analyze index usage and suggest new indexes
   */
  static async analyzeIndexUsage(): Promise<{
    missing: string[];
    unused: string[];
    bloated: string[];
    statistics: any;
  }> {
    const analysis = {
      missing: [] as string[],
      unused: [] as string[],
      bloated: [] as string[],
      statistics: {} as any
    };

    try {
      // Find missing indexes based on slow queries
      const slowQueries = await prisma.$queryRaw<Array<{ query: string; calls: number; mean_time: number }>>`
        SELECT 
          query,
          calls,
          mean_exec_time as mean_time
        FROM pg_stat_statements
        WHERE 
          query LIKE '%DatabaseRow%'
          AND mean_exec_time > 100
        ORDER BY mean_exec_time DESC
        LIMIT 10
      `;

      // Analyze slow queries for missing index patterns
      for (const sq of slowQueries) {
        if (sq.query.includes('WHERE') && sq.query.includes('cells')) {
          if (!sq.query.includes('/*+ IndexScan')) {
            analysis.missing.push('Consider GIN index on cells JSONB column');
          }
        }
      }

      // Find unused indexes
      const unusedIndexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_stat_user_indexes
        WHERE 
          idx_scan < 10
          AND indexrelname LIKE 'idx_database_%'
      `;
      
      analysis.unused = unusedIndexes.map(idx => idx.indexname);

      // Find bloated indexes
      const bloatedIndexes = await prisma.$queryRaw<Array<{ indexname: string; bloat_ratio: number }>>`
        SELECT 
          schemaname || '.' || tablename || '.' || indexname as indexname,
          ROUND((CASE WHEN otta=0 THEN 0 ELSE bs*(sml.relpages-otta)::numeric/1024/1024 END), 2) AS bloat_ratio
        FROM (
          SELECT
            schemaname, tablename, indexname, bs,
            COALESCE(CEIL((cc.reltuples*((datahdr+ma-
              (CASE WHEN datahdr%ma=0 THEN ma ELSE datahdr%ma END))+nullhdr2+4))/(bs-20::float)),0) AS otta,
            COALESCE(c2.relpages,0) AS relpages
          FROM (
            SELECT
              ma,bs,schemaname,tablename,indexname,
              (datawidth+(hdr+ma-(case when hdr%ma=0 THEN ma ELSE hdr%ma END)))::numeric AS datahdr,
              (maxfracsum*(nullhdr+ma-(case when nullhdr%ma=0 THEN ma ELSE nullhdr%ma END))) AS nullhdr2
            FROM (
              SELECT
                schemaname, tablename, indexname, 
                current_setting('block_size')::numeric AS bs,
                CASE WHEN substring(v,12,3) IN ('8.0','8.1','8.2') THEN 27 ELSE 23 END AS hdr,
                CASE WHEN v ~ 'mingw32' THEN 8 ELSE 4 END AS ma,
                24 AS datawidth,
                0 AS maxfracsum,
                8 AS nullhdr
              FROM (
                SELECT 
                  n.nspname AS schemaname,
                  c.relname AS tablename,
                  i.relname AS indexname,
                  current_setting('server_version') AS v
                FROM pg_class c
                JOIN pg_index x ON c.oid = x.indrelid
                JOIN pg_class i ON i.oid = x.indexrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind IN ('r','m')
                  AND i.relname LIKE 'idx_database_%'
              ) AS foo
            ) AS constants
          ) AS baz
          JOIN pg_class cc ON cc.relname = tablename
          JOIN pg_class c2 ON c2.relname = indexname
        ) AS sml
        WHERE bloat_ratio > 20
      `;

      analysis.bloated = bloatedIndexes.map(idx => idx.indexname);

      // Get general statistics
      const stats = await prisma.$queryRaw<Array<any>>`
        SELECT 
          COUNT(*) as total_indexes,
          SUM(pg_relation_size(indexrelid)) as total_size,
          AVG(idx_scan) as avg_scans,
          AVG(idx_tup_read) as avg_tuples_read
        FROM pg_stat_user_indexes
        WHERE indexrelname LIKE 'idx_database_%'
      `;

      analysis.statistics = stats[0];

    } catch (error) {
      console.error('Error analyzing index usage:', error);
    }

    return analysis;
  }

  /**
   * Rebuild bloated indexes to reclaim space
   */
  static async rebuildBloatedIndexes(concurrently: boolean = true): Promise<string[]> {
    const rebuiltIndexes: string[] = [];
    
    try {
      const analysis = await this.analyzeIndexUsage();
      
      for (const indexName of analysis.bloated) {
        const concurrent = concurrently ? 'CONCURRENTLY' : '';
        
        try {
          // REINDEX CONCURRENTLY requires PostgreSQL 12+
          await prisma.$executeRawUnsafe(`REINDEX INDEX ${concurrent} ${indexName}`);
          rebuiltIndexes.push(indexName);
          console.log(`Rebuilt bloated index: ${indexName}`);
        } catch (error) {
          console.error(`Failed to rebuild index ${indexName}:`, error);
        }
      }
    } catch (error) {
      console.error('Error rebuilding bloated indexes:', error);
    }
    
    return rebuiltIndexes;
  }

  /**
   * Update table statistics for query planner optimization
   */
  static async analyzeTables(): Promise<void> {
    const tables = [
      'DatabaseBlock',
      'DatabaseRow',
      'DatabaseColumn',
      'DatabaseView',
      'DatabaseBlockStats'
    ];

    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(`ANALYZE "${table}"`);
        console.log(`Analyzed table: ${table}`);
      } catch (error) {
        console.error(`Failed to analyze table ${table}:`, error);
      }
    }
  }

  /**
   * Create specialized index for a specific query pattern
   */
  static async createCustomIndex(
    tableName: string,
    indexName: string,
    columns: string[],
    options?: {
      unique?: boolean;
      where?: string;
      using?: 'btree' | 'hash' | 'gin' | 'gist';
      include?: string[];
      concurrent?: boolean;
    }
  ): Promise<void> {
    const unique = options?.unique ? 'UNIQUE' : '';
    const using = options?.using ? `USING ${options.using}` : '';
    const where = options?.where ? `WHERE ${options.where}` : '';
    const include = options?.include?.length ? `INCLUDE (${options.include.join(', ')})` : '';
    const concurrent = options?.concurrent ? 'CONCURRENTLY' : '';

    const query = `
      CREATE ${unique} INDEX ${concurrent} IF NOT EXISTS ${indexName}
      ON "${tableName}" ${using} (${columns.join(', ')})
      ${include}
      ${where}
    `;

    try {
      await prisma.$executeRawUnsafe(query);
      console.log(`Created custom index: ${indexName}`);
    } catch (error) {
      console.error(`Failed to create custom index ${indexName}:`, error);
      throw error;
    }
  }

  /**
   * Monitor index performance in real-time
   */
  static async monitorIndexPerformance(): Promise<{
    hotIndexes: Array<{ name: string; scans: number; tuples: number }>;
    coldIndexes: Array<{ name: string; scans: number; size: string }>;
    recommendations: string[];
  }> {
    const result = {
      hotIndexes: [] as Array<{ name: string; scans: number; tuples: number }>,
      coldIndexes: [] as Array<{ name: string; scans: number; size: string }>,
      recommendations: [] as string[]
    };

    try {
      // Find frequently used indexes
      const hotIndexes = await prisma.$queryRaw<Array<any>>`
        SELECT 
          indexrelname as name,
          idx_scan as scans,
          idx_tup_read as tuples
        FROM pg_stat_user_indexes
        WHERE 
          indexrelname LIKE 'idx_database_%'
          AND idx_scan > 1000
        ORDER BY idx_scan DESC
        LIMIT 10
      `;
      
      result.hotIndexes = hotIndexes;

      // Find rarely used indexes
      const coldIndexes = await prisma.$queryRaw<Array<any>>`
        SELECT 
          indexrelname as name,
          idx_scan as scans,
          pg_size_pretty(pg_relation_size(indexrelid)) as size
        FROM pg_stat_user_indexes
        WHERE 
          indexrelname LIKE 'idx_database_%'
          AND idx_scan < 100
        ORDER BY pg_relation_size(indexrelid) DESC
        LIMIT 10
      `;
      
      result.coldIndexes = coldIndexes;

      // Generate recommendations
      if (result.coldIndexes.length > 5) {
        result.recommendations.push('Consider dropping unused indexes to reduce storage overhead');
      }
      
      if (result.hotIndexes.some(idx => idx.tuples / idx.scans > 1000)) {
        result.recommendations.push('Some indexes are reading too many tuples - consider more selective indexes');
      }

    } catch (error) {
      console.error('Error monitoring index performance:', error);
    }

    return result;
  }
}

// Auto-create indexes on startup
if (process.env.NODE_ENV === 'production') {
  DatabaseBlockIndexService.createIndexes().catch(console.error);
}