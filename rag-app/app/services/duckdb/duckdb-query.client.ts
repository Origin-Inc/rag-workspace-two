import { getDuckDB } from './duckdb-service.client';
import type { DataFile } from '~/atoms/chat-atoms';
import { ContextWindowManagerClient } from '~/services/context-window-manager.client';

export interface QueryResult {
  success: boolean;
  data?: any[];
  error?: string;
  sql?: string;
  rowCount?: number;
  executionTime?: number;
  columns?: string[];
  tableUsageStats?: Record<string, { rowsScanned?: number; columnsAccessed?: string[] }>;
}

export interface SQLGenerationResponse {
  sql: string;
  explanation: string;
  confidence: number;
  tables: string[];
  suggestedVisualization?: 'table' | 'chart' | 'number';
  usedTables?: Array<{
    name: string;
    filename: string;
    fileId?: string;
    columnsUsed?: string[];
  }>;
}

export class DuckDBQueryService {
  private static instance: DuckDBQueryService;

  private constructor() {}

  public static getInstance(): DuckDBQueryService {
    if (!DuckDBQueryService.instance) {
      DuckDBQueryService.instance = new DuckDBQueryService();
    }
    return DuckDBQueryService.instance;
  }

  /**
   * Generate SQL from natural language query using the API
   */
  public async generateSQL(
    query: string,
    tables: DataFile[],
    pageId: string,
    workspaceId?: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<SQLGenerationResponse> {
    try {
      // Prepare tables with intelligent sampling
      const tablesWithSamples = await Promise.all(tables.map(async t => {
        let sampleData: any[] | undefined;
        
        // Try to get sample data from DuckDB
        try {
          const duckdb = getDuckDB();
          if (duckdb.isReady()) {
            const conn = await duckdb.getConnection();
            const result = await conn.query(`SELECT * FROM ${t.tableName} LIMIT 100`);
            const allData = result.toArray();
            
            // Use intelligent sampling based on query
            if (allData.length > 0 && t.schema) {
              const { data: sampledData } = ContextWindowManagerClient.optimizeDataForContext(
                allData,
                t.schema,
                query,
                2000 // Allocate ~2000 tokens for sample data per table
              );
              sampleData = sampledData;
            }
          }
        } catch (error) {
          console.log(`Could not fetch sample data for ${t.tableName}:`, error);
        }
        
        return {
          id: t.id,
          filename: t.tableName,
          tableName: t.tableName,
          schema: t.schema,
          rowCount: t.rowCount,
          data: sampleData,
        };
      }));
      
      console.log('[generateSQL] Sending request to API:', {
        query,
        filesCount: tablesWithSamples.length,
        firstFile: tablesWithSamples[0] ? {
          filename: tablesWithSamples[0].filename,
          tableName: tablesWithSamples[0].tableName,
          hasData: !!tablesWithSamples[0].data,
          dataLength: tablesWithSamples[0].data?.length || 0,
          schemaColumns: tablesWithSamples[0].schema?.columns?.length || 0
        } : null
      });

      const response = await fetch('/api/generate-sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          pageId,
          workspaceId,
          files: tablesWithSamples,
          conversationHistory,
        }),
      });

      console.log('[generateSQL] API response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        let error;
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { error: errorText };
        }
        console.error('[generateSQL] API returned error:', error);
        throw new Error(error.error || 'Failed to generate SQL');
      }

      const result = await response.json();
      console.log('[generateSQL] API returned result:', {
        hasSql: !!result.sql,
        sql: result.sql?.slice(0, 100),
        hasError: !!result.error,
        error: result.error,
        confidence: result.confidence
      });

      return result;
    } catch (error) {
      console.error('[generateSQL] ❌ FAILED:', error);
      
      // Return a fallback response with explanation
      return {
        sql: '',
        explanation: '⚠️ Unable to understand your query. Please try rephrasing or be more specific about what data you want to see.',
        tables: [],
        confidence: 0,
        error: error instanceof Error ? error.message : 'Failed to generate SQL'
      };
    }
  }

  /**
   * Execute SQL query against DuckDB
   */
  public async executeQuery(sql: string, trackUsage: boolean = false): Promise<QueryResult> {
    const startTime = performance.now();
    
    try {
      const duckdb = getDuckDB();
      
      // Ensure DuckDB is initialized
      if (!duckdb.isReady()) {
        await duckdb.initialize();
      }

      // Execute the query
      const conn = await duckdb.getConnection();
      const result = await conn.query(sql);
      
      // Convert result to array
      const data = result.toArray();
      const executionTime = performance.now() - startTime;
      
      // Get column names
      const columns = result.schema.fields.map(f => f.name);
      
      // Track table usage if requested
      let tableUsageStats;
      if (trackUsage) {
        try {
          // Run EXPLAIN to get query plan for more accurate stats
          const explainResult = await conn.query(`EXPLAIN ${sql}`);
          const explainData = explainResult.toArray();
          
          // Parse explain output for table scan information
          tableUsageStats = this.parseExplainForTableUsage(explainData);
        } catch (err) {
          console.log('Could not get table usage stats:', err);
        }
      }

      return {
        success: true,
        data,
        sql,
        rowCount: data.length,
        executionTime,
        columns,
        tableUsageStats,
      };
    } catch (error) {
      console.error('Query execution failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Query execution failed';
      
      // Check if it's a "table does not exist" error
      if (errorMessage.includes('does not exist') && errorMessage.includes('Table with name')) {
        // Extract table name from error
        const tableMatch = errorMessage.match(/Table with name (\S+) does not exist/);
        const tableName = tableMatch ? tableMatch[1] : 'the requested table';
        
        return {
          success: false,
          error: `❌ Table "${tableName}" not found in database. Please re-upload the file to query it.`,
          sql,
          executionTime: performance.now() - startTime,
        };
      }
      
      return {
        success: false,
        error: errorMessage,
        sql,
        executionTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Process a natural language query end-to-end
   */
  public async processNaturalLanguageQuery(
    query: string,
    tables: DataFile[],
    pageId: string,
    workspaceId?: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<{
    sqlGeneration: SQLGenerationResponse;
    queryResult: QueryResult;
  }> {
    // Step 1: Generate SQL from natural language with context
    const sqlGeneration = await this.generateSQL(query, tables, pageId, workspaceId, conversationHistory);
    
    // Step 2: Execute the generated SQL (only if SQL was generated)
    let queryResult: QueryResult;
    
    if (!sqlGeneration.sql) {
      queryResult = {
        success: false,
        error: sqlGeneration.error || 'No SQL query could be generated',
        sql: '',
        executionTime: 0,
      };
    } else {
      queryResult = await this.executeQuery(sqlGeneration.sql, true); // Enable usage tracking
      
      // Enhance usedTables with actual row counts if available
      if (sqlGeneration.usedTables && queryResult.tableUsageStats) {
        sqlGeneration.usedTables = sqlGeneration.usedTables.map(table => {
          const stats = queryResult.tableUsageStats?.[table.name];
          if (stats?.rowsScanned) {
            return { ...table, rowsAccessed: stats.rowsScanned };
          }
          return table;
        });
      }
    }
    
    return {
      sqlGeneration,
      queryResult,
    };
  }

  /**
   * Format query results for display with proper markdown
   */
  public formatResults(result: QueryResult): string {
    if (!result.success || !result.data) {
      return result.error || 'No results';
    }

    if (result.data.length === 0) {
      return 'Query returned no results';
    }

    // For single value results
    if (result.data.length === 1 && Object.keys(result.data[0]).length === 1) {
      const value = Object.values(result.data[0])[0];
      return `**Result:** ${value}`;
    }

    // Format as markdown table for better display
    return this.formatAsMarkdownTable(result.data, result.columns);
  }

  /**
   * Format data as a markdown table
   */
  private formatAsMarkdownTable(data: any[], columns?: string[]): string {
    if (!data || data.length === 0) return 'No data';

    const cols = columns || Object.keys(data[0]);
    
    // Build markdown table
    let table = '| ' + cols.map(col => this.formatColumnName(col)).join(' | ') + ' |\n';
    table += '|' + cols.map(() => '---').join('|') + '|\n';
    
    // Add data rows (limit to 20 for display)
    const displayData = data.slice(0, 20);
    displayData.forEach(row => {
      table += '| ' + cols.map(col => {
        const value = row[col];
        if (value === null || value === undefined) return '';
        if (typeof value === 'number') {
          return Number.isInteger(value) ? value.toString() : value.toFixed(2);
        }
        return String(value);
      }).join(' | ') + ' |\n';
    });
    
    if (data.length > 20) {
      table += `\n*Showing first 20 of ${data.length} rows*\n`;
    }
    
    return table;
  }
  
  /**
   * Format column names to be more readable
   */
  private formatColumnName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }
  
  /**
   * Parse EXPLAIN output to extract table usage information
   */
  private parseExplainForTableUsage(explainData: any[]): Record<string, { rowsScanned?: number; columnsAccessed?: string[] }> {
    const usage: Record<string, { rowsScanned?: number; columnsAccessed?: string[] }> = {};
    
    // DuckDB EXPLAIN output is typically a single row with the query plan
    if (explainData.length > 0 && explainData[0]) {
      const planText = String(explainData[0]['explain_value'] || explainData[0]['QUERY_PLAN'] || '');
      
      // Extract table scan information from the plan
      // Look for patterns like "SEQ_SCAN(table_name)" or "TABLE_SCAN(table_name)"
      const scanPattern = /(?:SEQ_SCAN|TABLE_SCAN|INDEX_SCAN)\s*\(([^)]+)\)/gi;
      const matches = planText.matchAll(scanPattern);
      
      for (const match of matches) {
        const tableName = match[1].trim();
        if (!usage[tableName]) {
          usage[tableName] = {};
        }
        
        // Try to extract row count estimates if available
        const rowPattern = new RegExp(`${tableName}.*?rows[=:]\\s*(\\d+)`, 'i');
        const rowMatch = planText.match(rowPattern);
        if (rowMatch) {
          usage[tableName].rowsScanned = parseInt(rowMatch[1], 10);
        }
      }
    }
    
    return usage;
  }

  /**
   * Validate SQL for safety (prevent destructive operations)
   */
  public validateSQL(sql: string): { valid: boolean; reason?: string } {
    const dangerousPatterns = [
      /\bDROP\s+TABLE\b/i,
      /\bDROP\s+DATABASE\b/i,
      /\bDELETE\s+FROM\b/i,
      /\bTRUNCATE\b/i,
      /\bALTER\s+TABLE\b/i,
      /\bCREATE\s+TABLE\b/i,
      /\bINSERT\s+INTO\b/i,
      /\bUPDATE\s+/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        return {
          valid: false,
          reason: `SQL contains potentially destructive operation: ${pattern.source}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * PAGINATION METHODS
   * For virtual scrolling support with large datasets
   */

  /**
   * Execute a paginated query from a table
   * @param tableName - Name of the table to query
   * @param offset - Number of rows to skip
   * @param limit - Number of rows to return
   * @param orderBy - Optional ORDER BY clause (e.g., "id ASC")
   */
  public async executeTablePaginated(
    tableName: string,
    offset: number,
    limit: number,
    orderBy?: string
  ): Promise<QueryResult> {
    const orderClause = orderBy ? ` ORDER BY ${orderBy}` : '';
    const sql = `SELECT * FROM ${tableName}${orderClause} LIMIT ${limit} OFFSET ${offset}`;
    return this.executeQuery(sql);
  }

  /**
   * Get total row count for a table
   * @param tableName - Name of the table
   */
  public async getTableRowCount(tableName: string): Promise<number> {
    try {
      const result = await this.executeQuery(`SELECT COUNT(*) as count FROM ${tableName}`);
      if (result.success && result.data && result.data.length > 0) {
        return result.data[0].count;
      }
      return 0;
    } catch (error) {
      console.error('Failed to get table row count:', error);
      return 0;
    }
  }

  /**
   * Add pagination to an existing SQL query
   * @param sql - Original SQL query
   * @param offset - Number of rows to skip
   * @param limit - Number of rows to return
   */
  public addPaginationToSQL(sql: string, offset: number, limit: number): string {
    // Remove existing LIMIT/OFFSET if present
    const cleanSQL = sql
      .replace(/\s+LIMIT\s+\d+/gi, '')
      .replace(/\s+OFFSET\s+\d+/gi, '');

    return `${cleanSQL} LIMIT ${limit} OFFSET ${offset}`;
  }

  /**
   * Execute a paginated query with custom SQL
   * @param sql - Base SQL query (without LIMIT/OFFSET)
   * @param offset - Number of rows to skip
   * @param limit - Number of rows to return
   */
  public async executeQueryPaginated(
    sql: string,
    offset: number,
    limit: number
  ): Promise<QueryResult> {
    const paginatedSQL = this.addPaginationToSQL(sql, offset, limit);
    return this.executeQuery(paginatedSQL);
  }

  /**
   * Get total row count for a query (counts results before pagination)
   * @param sql - Base SQL query (without LIMIT/OFFSET)
   */
  public async getQueryRowCount(sql: string): Promise<number> {
    try {
      // Wrap query in COUNT to get total
      const countSQL = `SELECT COUNT(*) as count FROM (${sql}) as subquery`;
      const result = await this.executeQuery(countSQL);

      if (result.success && result.data && result.data.length > 0) {
        return result.data[0].count;
      }
      return 0;
    } catch (error) {
      console.error('Failed to get query row count:', error);
      return 0;
    }
  }

  /**
   * Load a page of data for virtual scrolling
   * Helper method that combines pagination with metadata
   *
   * @param tableName - Name of the table
   * @param page - Page number (0-indexed)
   * @param pageSize - Number of rows per page
   * @param orderBy - Optional ORDER BY clause
   */
  public async loadPage(
    tableName: string,
    page: number,
    pageSize: number,
    orderBy?: string
  ): Promise<{
    data: any[];
    page: number;
    pageSize: number;
    totalRows: number;
    totalPages: number;
    hasMore: boolean;
  }> {
    const offset = page * pageSize;

    // Get data and total count in parallel
    const [queryResult, totalRows] = await Promise.all([
      this.executeTablePaginated(tableName, offset, pageSize, orderBy),
      this.getTableRowCount(tableName)
    ]);

    const totalPages = Math.ceil(totalRows / pageSize);

    return {
      data: queryResult.data || [],
      page,
      pageSize,
      totalRows,
      totalPages,
      hasMore: page < totalPages - 1
    };
  }
}

// Export singleton instance
export const duckDBQuery = DuckDBQueryService.getInstance();