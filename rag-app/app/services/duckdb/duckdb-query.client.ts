import { getDuckDB } from './duckdb-service.client';
import type { DataFile } from '~/stores/chat-store-ultimate-fix';
import { ContextWindowManagerClient } from '~/services/context-window-manager.client';

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
          name: t.tableName,
          schema: t.schema,
          rowCount: t.rowCount,
          data: sampleData,
        };
      }));
      
      const response = await fetch('/api/chat-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          pageId,
          workspaceId,
          tables: tablesWithSamples,
          conversationHistory,
          model: 'gpt-4-turbo-preview', // Can be made configurable
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate SQL');
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to generate SQL:', error);
      
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
      queryResult = await this.executeQuery(sqlGeneration.sql);
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