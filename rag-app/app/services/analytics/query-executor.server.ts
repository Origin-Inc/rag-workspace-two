import { prisma } from '~/utils/db.server';
import type { DatabaseBlock, DatabaseColumn, DatabaseRow } from '~/types/database-block';
import type { ParsedQuery, QueryResult, AggregationType } from './query-parser.server';
import { redis } from '~/services/redis.server';

/**
 * Query Executor Service
 * Executes parsed queries against database blocks
 */
export class QueryExecutor {
  private static readonly CACHE_TTL = 300; // 5 minutes
  private static readonly MAX_EXECUTION_TIME = 5000; // 5 seconds

  /**
   * Execute a parsed query against a database block
   */
  static async execute(
    parsedQuery: ParsedQuery,
    databaseBlockId: string
  ): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(parsedQuery, databaseBlockId);
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return {
            success: true,
            data: JSON.parse(cached),
            metadata: {
              cached: true,
              executionTime: Date.now() - startTime,
            },
          };
        }
      }

      // Fetch database block with rows
      const databaseBlock = await prisma.databaseBlock.findUnique({
        where: { id: databaseBlockId },
        include: {
          columns: true,
          rows: {
            orderBy: { position: 'asc' },
          },
        },
      });

      if (!databaseBlock) {
        return {
          success: false,
          error: 'Database block not found',
        };
      }

      // Execute based on intent
      let result: any;
      
      switch (parsedQuery.intent) {
        case 'aggregate':
          result = await this.executeAggregation(
            parsedQuery,
            databaseBlock.columns,
            databaseBlock.rows
          );
          break;
        
        case 'count':
          result = await this.executeCount(
            parsedQuery,
            databaseBlock.rows
          );
          break;
        
        case 'filter':
        case 'list':
          result = await this.executeFilter(
            parsedQuery,
            databaseBlock.columns,
            databaseBlock.rows
          );
          break;
        
        case 'compare':
          result = await this.executeComparison(
            parsedQuery,
            databaseBlock.columns,
            databaseBlock.rows
          );
          break;
        
        case 'trend':
          result = await this.executeTrend(
            parsedQuery,
            databaseBlock.columns,
            databaseBlock.rows
          );
          break;
        
        default:
          return {
            success: false,
            error: 'Unsupported query intent',
          };
      }

      // Cache the result
      if (redis && result !== null) {
        await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      }

      // Log query for audit
      await this.logQuery(parsedQuery, databaseBlockId, true);

      return {
        success: true,
        data: result,
        metadata: {
          rowsAffected: Array.isArray(result) ? result.length : 1,
          executionTime: Date.now() - startTime,
          source: {
            table: databaseBlock.name,
            columns: this.getUsedColumns(parsedQuery),
          },
          cached: false,
        },
      };
    } catch (error) {
      // Log failed query
      await this.logQuery(parsedQuery, databaseBlockId, false, error as Error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query execution failed',
        metadata: {
          executionTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Execute aggregation query
   */
  private static async executeAggregation(
    query: ParsedQuery,
    columns: DatabaseColumn[],
    rows: DatabaseRow[]
  ): Promise<any> {
    if (!query.column || !query.aggregation) {
      throw new Error('Missing column or aggregation type');
    }

    // Apply filters
    let filteredRows = this.applyFilters(rows, query.filters);
    
    // Apply date range
    if (query.dateRange) {
      filteredRows = this.applyDateRange(filteredRows, columns, query.dateRange);
    }

    // Get the target column
    const column = columns.find(c => c.id === query.column);
    if (!column) {
      throw new Error(`Column ${query.column} not found`);
    }

    // Perform aggregation
    const values = filteredRows
      .map(row => row.cells[query.column!])
      .filter(v => v !== null && v !== undefined);

    switch (query.aggregation) {
      case 'sum':
        return values.reduce((sum, val) => sum + Number(val), 0);
      
      case 'avg':
        if (values.length === 0) return 0;
        const total = values.reduce((sum, val) => sum + Number(val), 0);
        return total / values.length;
      
      case 'min':
        if (values.length === 0) return null;
        return Math.min(...values.map(Number));
      
      case 'max':
        if (values.length === 0) return null;
        return Math.max(...values.map(Number));
      
      case 'count':
        return values.length;
      
      case 'distinct':
        return new Set(values).size;
      
      default:
        throw new Error(`Unsupported aggregation: ${query.aggregation}`);
    }
  }

  /**
   * Execute count query
   */
  private static async executeCount(
    query: ParsedQuery,
    rows: DatabaseRow[]
  ): Promise<number> {
    // Apply filters
    let filteredRows = this.applyFilters(rows, query.filters);
    
    return filteredRows.length;
  }

  /**
   * Execute filter/list query
   */
  private static async executeFilter(
    query: ParsedQuery,
    columns: DatabaseColumn[],
    rows: DatabaseRow[]
  ): Promise<any[]> {
    // Apply filters
    let filteredRows = this.applyFilters(rows, query.filters);
    
    // Apply date range
    if (query.dateRange) {
      filteredRows = this.applyDateRange(filteredRows, columns, query.dateRange);
    }

    // Apply ordering
    if (query.orderBy) {
      filteredRows = this.applyOrdering(filteredRows, query.orderBy);
    }

    // Apply limit
    if (query.limit) {
      filteredRows = filteredRows.slice(0, query.limit);
    }

    // Return formatted results
    return filteredRows.map(row => ({
      id: row.id,
      ...row.cells,
    }));
  }

  /**
   * Execute comparison query
   */
  private static async executeComparison(
    query: ParsedQuery,
    columns: DatabaseColumn[],
    rows: DatabaseRow[]
  ): Promise<any> {
    // For comparison, we need to group by some dimension
    if (!query.groupBy || query.groupBy.length === 0) {
      throw new Error('Comparison requires grouping dimension');
    }

    const groups = this.groupRows(rows, query.groupBy[0]);
    const results: any = {};

    for (const [groupKey, groupRows] of Object.entries(groups)) {
      // Apply aggregation to each group
      const groupQuery = { ...query, filters: undefined };
      const value = await this.executeAggregation(groupQuery, columns, groupRows);
      results[groupKey] = value;
    }

    return results;
  }

  /**
   * Execute trend analysis query
   */
  private static async executeTrend(
    query: ParsedQuery,
    columns: DatabaseColumn[],
    rows: DatabaseRow[]
  ): Promise<any> {
    // Find date column
    const dateColumn = columns.find(c => c.type === 'date' || c.type === 'datetime');
    if (!dateColumn) {
      throw new Error('No date column found for trend analysis');
    }

    // Group by date periods (monthly by default)
    const grouped = this.groupByDatePeriod(rows, dateColumn.id, 'month');
    const results: any[] = [];

    for (const [period, periodRows] of Object.entries(grouped)) {
      const value = query.aggregation 
        ? await this.executeAggregation(
            { ...query, filters: undefined },
            columns,
            periodRows
          )
        : periodRows.length;

      results.push({
        period,
        value,
        count: periodRows.length,
      });
    }

    // Sort by period
    results.sort((a, b) => a.period.localeCompare(b.period));

    return results;
  }

  /**
   * Apply filters to rows
   */
  private static applyFilters(rows: DatabaseRow[], filters?: ParsedQuery['filters']): DatabaseRow[] {
    if (!filters || filters.length === 0) {
      return rows;
    }

    return rows.filter(row => {
      return filters.every(filter => {
        const value = row.cells[filter.column];
        
        switch (filter.operator) {
          case 'eq':
            return value == filter.value;
          case 'neq':
            return value != filter.value;
          case 'gt':
            return Number(value) > Number(filter.value);
          case 'gte':
            return Number(value) >= Number(filter.value);
          case 'lt':
            return Number(value) < Number(filter.value);
          case 'lte':
            return Number(value) <= Number(filter.value);
          case 'contains':
            return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
          case 'in':
            return Array.isArray(filter.value) 
              ? filter.value.includes(value)
              : value == filter.value;
          case 'between':
            if (Array.isArray(filter.value) && filter.value.length === 2) {
              const num = Number(value);
              return num >= Number(filter.value[0]) && num <= Number(filter.value[1]);
            }
            return false;
          default:
            return true;
        }
      });
    });
  }

  /**
   * Apply date range filter
   */
  private static applyDateRange(
    rows: DatabaseRow[],
    columns: DatabaseColumn[],
    dateRange: ParsedQuery['dateRange']
  ): DatabaseRow[] {
    if (!dateRange || !dateRange.start || !dateRange.end) {
      return rows;
    }

    // Find date columns
    const dateColumn = columns.find(c => c.type === 'date' || c.type === 'datetime');
    if (!dateColumn) {
      return rows;
    }

    const startTime = dateRange.start.getTime();
    const endTime = dateRange.end.getTime();

    return rows.filter(row => {
      const value = row.cells[dateColumn.id];
      if (!value) return false;
      
      const date = new Date(value);
      const time = date.getTime();
      
      return time >= startTime && time <= endTime;
    });
  }

  /**
   * Apply ordering to rows
   */
  private static applyOrdering(
    rows: DatabaseRow[],
    orderBy: ParsedQuery['orderBy']
  ): DatabaseRow[] {
    if (!orderBy || !orderBy.column) {
      return rows;
    }

    return [...rows].sort((a, b) => {
      const aVal = a.cells[orderBy.column];
      const bVal = b.cells[orderBy.column];
      
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      const comparison = aVal > bVal ? 1 : -1;
      return orderBy.direction === 'asc' ? comparison : -comparison;
    });
  }

  /**
   * Group rows by column
   */
  private static groupRows(
    rows: DatabaseRow[],
    groupByColumn: string
  ): Record<string, DatabaseRow[]> {
    const groups: Record<string, DatabaseRow[]> = {};
    
    for (const row of rows) {
      const key = String(row.cells[groupByColumn] || 'Other');
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    }
    
    return groups;
  }

  /**
   * Group rows by date period
   */
  private static groupByDatePeriod(
    rows: DatabaseRow[],
    dateColumn: string,
    period: 'day' | 'week' | 'month' | 'quarter' | 'year'
  ): Record<string, DatabaseRow[]> {
    const groups: Record<string, DatabaseRow[]> = {};
    
    for (const row of rows) {
      const value = row.cells[dateColumn];
      if (!value) continue;
      
      const date = new Date(value);
      let key: string;
      
      switch (period) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekNum = Math.ceil((date.getDate() - date.getDay() + 1) / 7);
          key = `${date.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
          break;
        case 'month':
          key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          break;
        case 'quarter':
          const quarter = Math.ceil((date.getMonth() + 1) / 3);
          key = `${date.getFullYear()}-Q${quarter}`;
          break;
        case 'year':
          key = date.getFullYear().toString();
          break;
      }
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(row);
    }
    
    return groups;
  }

  /**
   * Generate cache key
   */
  private static getCacheKey(query: ParsedQuery, blockId: string): string {
    const queryHash = JSON.stringify({
      intent: query.intent,
      aggregation: query.aggregation,
      column: query.column,
      filters: query.filters,
      dateRange: query.dateRange,
      groupBy: query.groupBy,
      orderBy: query.orderBy,
      limit: query.limit,
    });
    
    return `analytics:${blockId}:${queryHash}`;
  }

  /**
   * Get list of columns used in query
   */
  private static getUsedColumns(query: ParsedQuery): string[] {
    const columns = new Set<string>();
    
    if (query.column) {
      columns.add(query.column);
    }
    
    if (query.filters) {
      query.filters.forEach(f => columns.add(f.column));
    }
    
    if (query.groupBy) {
      query.groupBy.forEach(c => columns.add(c));
    }
    
    if (query.orderBy?.column) {
      columns.add(query.orderBy.column);
    }
    
    return Array.from(columns);
  }

  /**
   * Log query for audit
   */
  private static async logQuery(
    query: ParsedQuery,
    blockId: string,
    success: boolean,
    error?: Error
  ): Promise<void> {
    try {
      await prisma.queryAuditLog.create({
        data: {
          blockId,
          query: query.originalQuery,
          parsedQuery: query as any,
          success,
          error: error?.message,
          executedAt: new Date(),
        },
      });
    } catch (e) {
      // Audit logging failure should not break the query
      console.error('Failed to log query:', e);
    }
  }
}