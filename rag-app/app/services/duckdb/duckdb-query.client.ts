import { getDuckDB } from './duckdb-service.client';
import type { DataFile } from '~/stores/chat-store-ultimate-fix';

export interface QueryResult {
  success: boolean;
  data?: any[];
  error?: string;
  sql?: string;
  rowCount?: number;
  executionTime?: number;
  columns?: string[];
}

export interface SQLGenerationResponse {
  sql: string;
  explanation: string;
  confidence: number;
  tables: string[];
  suggestedVisualization?: 'table' | 'chart' | 'number';
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
    workspaceId?: string
  ): Promise<SQLGenerationResponse> {
    try {
      const response = await fetch('/api/chat-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          pageId,
          workspaceId,
          tables: tables.map(t => ({
            name: t.tableName,
            schema: t.schema,
            rowCount: t.rowCount,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate SQL');
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to generate SQL:', error);
      throw error;
    }
  }

  /**
   * Execute SQL query against DuckDB
   */
  public async executeQuery(sql: string): Promise<QueryResult> {
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

      return {
        success: true,
        data,
        sql,
        rowCount: data.length,
        executionTime,
        columns,
      };
    } catch (error) {
      console.error('Query execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query execution failed',
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
    workspaceId?: string
  ): Promise<{
    sqlGeneration: SQLGenerationResponse;
    queryResult: QueryResult;
  }> {
    // Step 1: Generate SQL from natural language
    const sqlGeneration = await this.generateSQL(query, tables, pageId, workspaceId);
    
    // Step 2: Execute the generated SQL
    const queryResult = await this.executeQuery(sqlGeneration.sql);
    
    return {
      sqlGeneration,
      queryResult,
    };
  }

  /**
   * Format query results for display
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
      return `Result: ${value}`;
    }

    // For small result sets, format as text table
    if (result.data.length <= 10) {
      return this.formatAsTextTable(result.data, result.columns);
    }

    // For large result sets, return summary
    return `Query returned ${result.rowCount} rows. Execution time: ${result.executionTime?.toFixed(2)}ms`;
  }

  /**
   * Format data as a simple text table
   */
  private formatAsTextTable(data: any[], columns?: string[]): string {
    if (!data || data.length === 0) return 'No data';

    const cols = columns || Object.keys(data[0]);
    const maxWidths: { [key: string]: number } = {};

    // Calculate max width for each column
    cols.forEach(col => {
      maxWidths[col] = col.length;
      data.forEach(row => {
        const value = String(row[col] ?? '');
        maxWidths[col] = Math.max(maxWidths[col], value.length);
      });
    });

    // Build header
    let table = cols.map(col => col.padEnd(maxWidths[col])).join(' | ') + '\n';
    table += cols.map(col => '-'.repeat(maxWidths[col])).join('-+-') + '\n';

    // Build rows
    data.forEach(row => {
      table += cols.map(col => {
        const value = String(row[col] ?? '');
        return value.padEnd(maxWidths[col]);
      }).join(' | ') + '\n';
    });

    return table;
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
}

// Export singleton instance
export const duckDBQuery = DuckDBQueryService.getInstance();