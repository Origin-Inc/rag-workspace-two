import { PrismaClient } from '@prisma/client';
import type { DatabaseRow, DatabaseColumn, Filter, Sort } from '~/types/database-block';

const prisma = new PrismaClient();

interface PaginationOptions {
  page: number;
  pageSize: number;
  filters?: Filter[];
  sorts?: Sort[];
  searchQuery?: string;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export class DatabaseBlockPaginationService {
  private static readonly MAX_PAGE_SIZE = 1000;
  private static readonly DEFAULT_PAGE_SIZE = 100;
  private static readonly CURSOR_CACHE = new Map<string, any>();

  /**
   * Get paginated rows with efficient cursor-based pagination
   */
  static async getPaginatedRows(
    blockId: string,
    options: PaginationOptions
  ): Promise<PaginatedResult<DatabaseRow>> {
    const pageSize = Math.min(
      options.pageSize || this.DEFAULT_PAGE_SIZE,
      this.MAX_PAGE_SIZE
    );
    
    const offset = (options.page - 1) * pageSize;

    // Build WHERE clause from filters
    const whereClause = this.buildWhereClause(blockId, options.filters, options.searchQuery);
    
    // Build ORDER BY clause from sorts
    const orderByClause = this.buildOrderByClause(options.sorts);

    // Get total count (cached for performance)
    const cacheKey = `count_${blockId}_${JSON.stringify(whereClause)}`;
    let total = this.CURSOR_CACHE.get(cacheKey);
    
    if (total === undefined) {
      total = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count 
        FROM db_block_rows 
        WHERE db_block_id = ${blockId}::uuid
        ${whereClause ? `AND ${whereClause}` : ''}
      `.then(result => Number(result[0].count));
      
      // Cache for 5 seconds
      this.CURSOR_CACHE.set(cacheKey, total);
      setTimeout(() => this.CURSOR_CACHE.delete(cacheKey), 5000);
    }

    // Fetch paginated data
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        id,
        data,
        "position",
        created_at,
        updated_at
      FROM db_block_rows
      WHERE db_block_id = $1::uuid
      ${whereClause ? `AND ${whereClause}` : ''}
      ${orderByClause}
      LIMIT $2
      OFFSET $3
    `, blockId, pageSize, offset);

    // Transform to DatabaseRow format
    const data: DatabaseRow[] = rows.map(row => ({
      id: row.id,
      cells: row.data,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    const totalPages = Math.ceil(total / pageSize);

    return {
      data,
      total,
      page: options.page,
      pageSize,
      totalPages,
      hasMore: options.page < totalPages
    };
  }

  /**
   * Stream large datasets using cursor-based iteration
   */
  static async *streamRows(
    blockId: string,
    options: Omit<PaginationOptions, 'page'> & { batchSize?: number }
  ): AsyncGenerator<DatabaseRow[], void, unknown> {
    const batchSize = options.batchSize || 500;
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      const query = cursor
        ? `
          SELECT id, data, "position", created_at, updated_at
          FROM db_block_rows
          WHERE db_block_id = $1::uuid
            AND id > $2
          ORDER BY id
          LIMIT $3
        `
        : `
          SELECT id, data, "position", created_at, updated_at
          FROM db_block_rows
          WHERE db_block_id = $1::uuid
          ORDER BY id
          LIMIT $2
        `;

      const params = cursor
        ? [blockId, cursor, batchSize]
        : [blockId, batchSize];

      const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params);

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      const batch: DatabaseRow[] = rows.map(row => ({
        id: row.id,
        cells: row.data,
        position: row.position,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      yield batch;

      cursor = rows[rows.length - 1].id;
      hasMore = rows.length === batchSize;
    }
  }

  /**
   * Get virtual scroll window of data
   */
  static async getVirtualWindow(
    blockId: string,
    startIndex: number,
    endIndex: number,
    options?: {
      filters?: Filter[];
      sorts?: Sort[];
    }
  ): Promise<{ rows: DatabaseRow[]; total: number }> {
    const limit = endIndex - startIndex + 1;
    
    // Build query with window
    const whereClause = this.buildWhereClause(blockId, options?.filters);
    const orderByClause = this.buildOrderByClause(options?.sorts);

    // Use ROW_NUMBER() for precise windowing
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      WITH numbered_rows AS (
        SELECT 
          id,
          data,
          "position",
          created_at,
          updated_at,
          ROW_NUMBER() OVER (${orderByClause || 'ORDER BY "position", id'}) as row_num
        FROM db_block_rows
        WHERE db_block_id = $1::uuid
        ${whereClause ? `AND ${whereClause}` : ''}
      )
      SELECT * FROM numbered_rows
      WHERE row_num > $2 AND row_num <= $3
    `, blockId, startIndex, endIndex + 1);

    // Get total count
    const totalResult = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count 
      FROM db_block_rows 
      WHERE db_block_id = ${blockId}::uuid
      ${whereClause ? `AND ${whereClause}` : ''}
    `;

    const total = Number(totalResult[0].count);

    return {
      rows: rows.map(row => ({
        id: row.id,
        cells: row.data,
        position: row.position,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      total
    };
  }

  /**
   * Prefetch adjacent pages for smooth scrolling
   */
  static async prefetchAdjacentPages(
    blockId: string,
    currentPage: number,
    options: PaginationOptions
  ): Promise<void> {
    const pagesToPrefetch = [
      currentPage - 1,
      currentPage + 1,
      currentPage + 2
    ].filter(p => p > 0);

    await Promise.all(
      pagesToPrefetch.map(page =>
        this.getPaginatedRows(blockId, { ...options, page })
      )
    );
  }

  /**
   * Build WHERE clause from filters
   */
  private static buildWhereClause(
    blockId: string,
    filters?: Filter[],
    searchQuery?: string
  ): string {
    const conditions: string[] = [];

    if (filters && filters.length > 0) {
      filters.forEach(filter => {
        const column = `data->>'${filter.columnId}'`;
        
        switch (filter.operator) {
          case 'equals':
            conditions.push(`${column} = '${filter.value}'`);
            break;
          case 'not_equals':
            conditions.push(`${column} != '${filter.value}'`);
            break;
          case 'contains':
            conditions.push(`${column} ILIKE '%${filter.value}%'`);
            break;
          case 'not_contains':
            conditions.push(`${column} NOT ILIKE '%${filter.value}%'`);
            break;
          case 'greater_than':
            conditions.push(`(${column})::numeric > ${filter.value}`);
            break;
          case 'less_than':
            conditions.push(`(${column})::numeric < ${filter.value}`);
            break;
          case 'is_empty':
            conditions.push(`(${column} IS NULL OR ${column} = '')`);
            break;
          case 'is_not_empty':
            conditions.push(`(${column} IS NOT NULL AND ${column} != '')`);
            break;
        }
      });
    }

    if (searchQuery) {
      conditions.push(`data::text ILIKE '%${searchQuery}%'`);
    }

    return conditions.length > 0 ? conditions.join(' AND ') : '';
  }

  /**
   * Build ORDER BY clause from sorts
   */
  private static buildOrderByClause(sorts?: Sort[]): string {
    if (!sorts || sorts.length === 0) {
      return 'ORDER BY "position", id';
    }

    const orderParts = sorts.map(sort => {
      const column = `data->>'${sort.columnId}'`;
      const direction = sort.direction === 'desc' ? 'DESC' : 'ASC';
      
      // Handle different data types
      if (sort.columnId.includes('date') || sort.columnId.includes('time')) {
        return `(${column})::timestamp ${direction}`;
      } else if (sort.columnId.includes('number') || sort.columnId.includes('value')) {
        return `(${column})::numeric ${direction}`;
      } else {
        return `${column} ${direction}`;
      }
    });

    return `ORDER BY ${orderParts.join(', ')}`;
  }

  /**
   * Get aggregated statistics for a database block
   */
  static async getAggregatedStats(
    blockId: string,
    columnId: string,
    aggregationType: 'sum' | 'avg' | 'min' | 'max' | 'count'
  ): Promise<number> {
    const column = `(data->>'${columnId}')::numeric`;
    
    const result = await prisma.$queryRawUnsafe<any[]>(`
      SELECT ${aggregationType.toUpperCase()}(${column}) as value
      FROM db_block_rows
      WHERE db_block_id = $1::uuid
        AND data->>'${columnId}' IS NOT NULL
    `, blockId);

    return result[0]?.value || 0;
  }

  /**
   * Batch update rows efficiently
   */
  static async batchUpdateRows(
    blockId: string,
    updates: Array<{ id: string; cells: Record<string, any> }>
  ): Promise<void> {
    if (updates.length === 0) return;

    // Use a single transaction for all updates
    await prisma.$transaction(
      updates.map(update =>
        prisma.$executeRaw`
          UPDATE db_block_rows
          SET 
            data = data || ${update.cells}::jsonb,
            updated_at = NOW()
          WHERE id = ${update.id}::uuid
            AND db_block_id = ${blockId}::uuid
        `
      )
    );
  }

  /**
   * Clear all caches
   */
  static clearCache(): void {
    this.CURSOR_CACHE.clear();
  }
}