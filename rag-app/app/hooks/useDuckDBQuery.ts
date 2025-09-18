import { useState, useCallback, useEffect } from 'react';
import { getDuckDB } from '~/services/duckdb/duckdb-service.client';
import type { DuckDBService } from '~/services/duckdb/duckdb-service.client';

export interface QueryResult {
  data: any[];
  columns: string[];
  rowCount: number;
  executionTime: number;
  error?: string;
}

export function useDuckDBQuery() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<QueryResult | null>(null);
  const [db, setDb] = useState<DuckDBService | null>(null);
  
  // Initialize DuckDB on mount
  useEffect(() => {
    const initDB = async () => {
      try {
        const duckdb = getDuckDB();
        if (!duckdb.isReady()) {
          await duckdb.initialize();
        }
        setDb(duckdb);
        setIsInitialized(duckdb.isReady());
      } catch (error) {
        console.error('Failed to initialize DuckDB:', error);
        setIsInitialized(false);
      }
    };
    
    initDB();
  }, []);
  
  /**
   * Execute a SQL query
   */
  const executeQuery = useCallback(async (sql: string): Promise<QueryResult> => {
    if (!db || !isInitialized) {
      throw new Error('DuckDB is not initialized');
    }
    
    setIsExecuting(true);
    const startTime = performance.now();
    
    try {
      const rawResult = await db.executeQuery(sql);
      const executionTime = performance.now() - startTime;
      
      // Extract column names if result has data
      const columns = rawResult.length > 0 
        ? Object.keys(rawResult[0])
        : [];
      
      const result: QueryResult = {
        data: rawResult,
        columns,
        rowCount: rawResult.length,
        executionTime
      };
      
      setLastResult(result);
      return result;
      
    } catch (error) {
      const executionTime = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Query execution failed';
      
      const result: QueryResult = {
        data: [],
        columns: [],
        rowCount: 0,
        executionTime,
        error: errorMessage
      };
      
      setLastResult(result);
      throw new Error(errorMessage);
      
    } finally {
      setIsExecuting(false);
    }
  }, [db, isInitialized]);
  
  /**
   * Get table schema
   */
  const getTableSchema = useCallback(async (tableName: string) => {
    if (!db || !isInitialized) {
      throw new Error('DuckDB is not initialized');
    }
    
    try {
      return await db.getTableSchema(tableName);
    } catch (error) {
      console.error(`Failed to get schema for ${tableName}:`, error);
      return [];
    }
  }, [db, isInitialized]);
  
  /**
   * Get all available tables
   */
  const getTables = useCallback(async (): Promise<string[]> => {
    if (!db || !isInitialized) {
      return [];
    }
    
    try {
      return await db.getTables();
    } catch (error) {
      console.error('Failed to get tables:', error);
      return [];
    }
  }, [db, isInitialized]);
  
  /**
   * Get sample data from a table
   */
  const getTableSample = useCallback(async (
    tableName: string,
    limit: number = 10
  ): Promise<any[]> => {
    if (!db || !isInitialized) {
      return [];
    }
    
    try {
      return await db.getTableSample(tableName, limit);
    } catch (error) {
      console.error(`Failed to get sample from ${tableName}:`, error);
      return [];
    }
  }, [db, isInitialized]);
  
  /**
   * Check if a table exists
   */
  const tableExists = useCallback(async (tableName: string): Promise<boolean> => {
    if (!db || !isInitialized) {
      return false;
    }
    
    try {
      return await db.tableExists(tableName);
    } catch (error) {
      console.error(`Failed to check if table ${tableName} exists:`, error);
      return false;
    }
  }, [db, isInitialized]);
  
  /**
   * Drop a table
   */
  const dropTable = useCallback(async (tableName: string): Promise<void> => {
    if (!db || !isInitialized) {
      throw new Error('DuckDB is not initialized');
    }
    
    try {
      await db.dropTable(tableName);
    } catch (error) {
      console.error(`Failed to drop table ${tableName}:`, error);
      throw error;
    }
  }, [db, isInitialized]);
  
  /**
   * Format query result as a table string
   */
  const formatResultAsTable = useCallback((result: QueryResult): string => {
    if (result.error) {
      return `Error: ${result.error}`;
    }
    
    if (result.data.length === 0) {
      return 'No results found.';
    }
    
    // Calculate column widths
    const widths = result.columns.map(col => {
      const maxDataWidth = Math.max(
        ...result.data.map(row => String(row[col] ?? '').length)
      );
      return Math.max(col.length, maxDataWidth, 4);
    });
    
    // Create header
    const header = result.columns
      .map((col, i) => col.padEnd(widths[i]))
      .join(' | ');
    
    const separator = widths.map(w => '-'.repeat(w)).join('-+-');
    
    // Create rows
    const rows = result.data
      .slice(0, 100) // Limit to 100 rows for display
      .map(row => 
        result.columns
          .map((col, i) => String(row[col] ?? '').padEnd(widths[i]))
          .join(' | ')
      );
    
    let table = `${header}\n${separator}\n${rows.join('\n')}`;
    
    if (result.data.length > 100) {
      table += `\n... and ${result.data.length - 100} more rows`;
    }
    
    table += `\n\nQuery executed in ${result.executionTime.toFixed(2)}ms, returned ${result.rowCount} rows.`;
    
    return table;
  }, []);
  
  return {
    isInitialized,
    isExecuting,
    lastResult,
    executeQuery,
    getTableSchema,
    getTables,
    getTableSample,
    tableExists,
    dropTable,
    formatResultAsTable
  };
}