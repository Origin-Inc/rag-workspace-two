import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { duckDBPersistence } from './duckdb-persistence.client';

export class DuckDBService {
  private static instance: DuckDBService | null = null;
  private db: AsyncDuckDB | null = null;
  private connection: AsyncDuckDBConnection | null = null;
  private isInitialized = false;
  private initializationError: Error | null = null;

  private constructor() {}

  /**
   * Normalize column name to match DuckDB's normalize_names behavior
   * Converts to lowercase, replaces non-alphanumeric with underscores
   */
  private normalizeColumnName(name: string): string {
    if (!name) return name;

    // DuckDB normalize_names behavior:
    // 1. Convert to lowercase
    // 2. Replace non-alphanumeric characters with underscores
    // 3. Trim whitespace
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
  }

  public static getInstance(): DuckDBService {
    if (!DuckDBService.instance) {
      DuckDBService.instance = new DuckDBService();
    }
    return DuckDBService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('DuckDB already initialized');
      return;
    }

    // Check if we've already tried and failed
    if (this.initializationError) {
      console.warn('DuckDB initialization previously failed, skipping');
      throw this.initializationError;
    }

    try {
      // Only initialize in browser environment
      if (typeof window === 'undefined') {
        console.log('DuckDB skipped - server environment');
        return;
      }

      // Get the bundles from jsDelivr CDN (works in production)
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      
      // Select the best bundle for the current browser
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      
      // Validate bundle components
      if (!bundle.mainWorker) {
        throw new Error('DuckDB bundle missing mainWorker');
      }
      
      // Create a worker for DuckDB
      const worker = await duckdb.createWorker(bundle.mainWorker);
      
      // Create a logger
      const logger = new duckdb.ConsoleLogger();
      
      // Initialize DuckDB
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      
      // Create a connection
      this.connection = await this.db.connect();
      
      this.isInitialized = true;
      console.log('DuckDB initialized successfully');
    } catch (error) {
      console.error('Failed to initialize DuckDB:', error);
      this.initializationError = error instanceof Error ? error : new Error('Unknown DuckDB initialization error');
      // Don't throw in production - allow app to function without DuckDB
      if (process.env.NODE_ENV === 'development') {
        throw this.initializationError;
      }
    }
  }

  public isReady(): boolean {
    return this.isInitialized && this.connection !== null;
  }

  public async getConnection(): Promise<AsyncDuckDBConnection> {
    if (!this.isInitialized || !this.connection) {
      await this.initialize();
    }
    if (!this.connection) {
      throw new Error('DuckDB connection not available');
    }
    return this.connection;
  }

  public getDB(): AsyncDuckDB | null {
    return this.db;
  }

  public async createTableFromCSV(tableName: string, csvData: string, pageId?: string): Promise<void> {
    try {
      const conn = await this.getConnection();
      
      // First, create a temporary file in DuckDB's virtual file system
      await this.db!.registerFileText(`${tableName}.csv`, csvData);
      
      // Create table from CSV with normalized column names
      await conn.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} AS
        SELECT * FROM read_csv_auto('${tableName}.csv', header=true, normalize_names=true)
      `);
      
      console.log(`Table ${tableName} created successfully`);
      
      // Persist to IndexedDB if pageId is provided
      if (pageId) {
        const rowCount = await this.getTableRowCount(tableName);
        const schema = await this.getTableSchema(tableName);
        await duckDBPersistence.persistTable(tableName, pageId, schema, rowCount);
      }
    } catch (error) {
      console.error('Failed to create table from CSV:', error);
      throw error;
    }
  }

  public async createTableFromJSON(tableName: string, jsonData: any[], pageId?: string): Promise<void> {
    try {
      const conn = await this.getConnection();
      
      // Convert JSON to CSV format for DuckDB
      if (jsonData.length === 0) {
        throw new Error('Cannot create table from empty data');
      }
      
      // Register JSON data
      const jsonString = JSON.stringify(jsonData);
      await this.db!.registerFileText(`${tableName}.json`, jsonString);
      
      // Create table from JSON with normalized column names
      await conn.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} AS
        SELECT * FROM read_json_auto('${tableName}.json', normalize_names=true)
      `);
      
      console.log(`Table ${tableName} created from JSON successfully`);
      
      // Persist to IndexedDB if pageId is provided
      if (pageId) {
        const rowCount = await this.getTableRowCount(tableName);
        const schema = await this.getTableSchema(tableName);
        await duckDBPersistence.persistTable(tableName, pageId, schema, rowCount);
      }
    } catch (error) {
      console.error('Failed to create table from JSON:', error);
      throw error;
    }
  }

  public async getTableSchema(tableName: string): Promise<any[]> {
    try {
      const conn = await this.getConnection();
      const result = await conn.query(`DESCRIBE ${tableName}`);
      return result.toArray();
    } catch (error) {
      console.error('Failed to get table schema:', error);
      return [];
    }
  }

  public async getTables(): Promise<string[]> {
    try {
      const conn = await this.getConnection();
      const result = await conn.query(`SHOW TABLES`);
      const tables = result.toArray();
      return tables.map((row: any) => row.name || row.Name);
    } catch (error) {
      console.error('Failed to get tables:', error);
      return [];
    }
  }

  public async dropTable(tableName: string): Promise<void> {
    try {
      const conn = await this.getConnection();
      await conn.query(`DROP TABLE IF EXISTS ${tableName}`);
      console.log(`Table ${tableName} dropped`);
    } catch (error) {
      console.error('Failed to drop table:', error);
    }
  }

  public async cleanup(): Promise<void> {
    try {
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      if (this.db) {
        await this.db.terminate();
        this.db = null;
      }
      this.isInitialized = false;
      console.log('DuckDB cleaned up');
    } catch (error) {
      console.error('Failed to cleanup DuckDB:', error);
    }
  }

  public async getTableRowCount(tableName: string): Promise<number> {
    try {
      const conn = await this.getConnection();
      const result = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const data = result.toArray();
      return data[0]?.count || 0;
    } catch (error) {
      console.error('Failed to get row count:', error);
      return 0;
    }
  }

  public async getTableSample(tableName: string, limit: number = 10): Promise<any[]> {
    try {
      const conn = await this.getConnection();
      const result = await conn.query(`SELECT * FROM ${tableName} LIMIT ${limit}`);
      return result.toArray();
    } catch (error) {
      console.error('Failed to get table sample:', error);
      return [];
    }
  }

  public async createTableFromData(
    tableName: string, 
    data: any[], 
    schema?: { columns: Array<{ name: string; type: string }> },
    pageId?: string
  ): Promise<void> {
    if (!data || data.length === 0) {
      throw new Error('Cannot create table from empty data');
    }

    try {
      const conn = await this.getConnection();
      
      // Drop table if exists
      await conn.query(`DROP TABLE IF EXISTS ${tableName}`);
      
      // Generate CREATE TABLE statement if schema is provided
      if (schema && schema.columns.length > 0) {
        // Process columns: normalize names and handle empty names
        let unnamedColumnCount = 0;
        const processedColumns = schema.columns.map(col => {
          let columnName = col.name ? col.name.trim() : '';
          let originalName = columnName; // Store original for data access

          // If column name is empty, give it a dummy name
          if (!columnName) {
            unnamedColumnCount++;
            columnName = `column_${unnamedColumnCount}`;
            console.log(`Warning: Empty column name replaced with "${columnName}"`);
          } else {
            // Normalize column name to match DuckDB behavior
            columnName = this.normalizeColumnName(columnName);
          }

          return {
            ...col,
            name: columnName,
            originalName: originalName || columnName
          };
        });
        
        const columnDefs = processedColumns.map(col => {
          let duckdbType = 'VARCHAR';
          switch (col.type.toLowerCase()) {
            case 'number':
              duckdbType = 'DOUBLE';
              break;
            case 'boolean':
              duckdbType = 'BOOLEAN';
              break;
            case 'date':
              duckdbType = 'DATE';
              break;
            case 'datetime':
              duckdbType = 'TIMESTAMP';
              break;
            default:
              duckdbType = 'VARCHAR';
          }
          return `"${col.name}" ${duckdbType}`;
        }).join(', ');
        
        await conn.query(`CREATE TABLE ${tableName} (${columnDefs})`);
        
        // Prepare data for insertion using processed columns
        const values = data.map(row => {
          const vals = processedColumns.map((col) => {
            // Use original column name for data access (before normalization)
            const val = row[col.originalName];
            
            if (val === null || val === undefined) return 'NULL';
            
            // Handle different data types
            if (typeof val === 'string' || col.type === 'string' || col.type === 'VARCHAR') {
              // Properly escape strings for SQL
              return `'${String(val).replace(/'/g, "''")}'`;
            } else if (col.type === 'date' || col.type === 'datetime' || col.type === 'DATE') {
              // Handle date values - could be timestamp or string
              if (typeof val === 'number') {
                // Unix timestamp - convert to ISO string
                const date = new Date(val);
                if (!isNaN(date.getTime())) {
                  return `'${date.toISOString().split('T')[0]}'`;
                }
              }
              return `'${String(val).replace(/'/g, "''")}'`;
            } else if (typeof val === 'boolean') {
              return val ? 'TRUE' : 'FALSE';
            }
            
            return val;
          }).join(', ');
          return `(${vals})`;
        });
        
        // Insert data in batches to avoid query size limits
        const batchSize = 1000;
        for (let i = 0; i < values.length; i += batchSize) {
          const batch = values.slice(i, i + batchSize).join(', ');
          await conn.query(`INSERT INTO ${tableName} VALUES ${batch}`);
        }
      } else {
        // Use JSON import for automatic schema detection with normalized names
        const jsonString = JSON.stringify(data);
        await this.db!.registerFileText(`${tableName}_import.json`, jsonString);

        await conn.query(`
          CREATE TABLE ${tableName} AS
          SELECT * FROM read_json_auto('${tableName}_import.json', normalize_names=true)
        `);
      }
      
      console.log(`Table ${tableName} created with ${data.length} rows`);
      
      // Persist to IndexedDB if pageId is provided
      if (pageId) {
        await duckDBPersistence.persistTable(tableName, pageId, schema, data.length);
      }
    } catch (error) {
      console.error('Failed to create table from data:', error);
      throw error;
    }
  }

  public async tableExists(tableName: string): Promise<boolean> {
    try {
      const tables = await this.getTables();
      return tables.includes(tableName);
    } catch (error) {
      console.error('Failed to check table existence:', error);
      return false;
    }
  }

  public async renameTable(oldName: string, newName: string): Promise<void> {
    try {
      const conn = await this.getConnection();
      await conn.query(`ALTER TABLE ${oldName} RENAME TO ${newName}`);
      console.log(`Table ${oldName} renamed to ${newName}`);
    } catch (error) {
      console.error('Failed to rename table:', error);
      throw error;
    }
  }

  public async executeQuery(sql: string): Promise<any> {
    try {
      const conn = await this.getConnection();
      const result = await conn.query(sql);
      return result;
    } catch (error) {
      console.error('Failed to execute query:', error);
      throw error;
    }
  }
  
  /**
   * Restore persisted tables for a page from IndexedDB
   */
  public async restoreTablesForPage(pageId: string): Promise<any[]> {
    try {
      // Make sure DuckDB is initialized first
      if (!this.isReady()) {
        await this.initialize();
      }
      
      // Restore tables from IndexedDB
      const restoredFiles = await duckDBPersistence.restoreTables(pageId);
      console.log(`Restored ${restoredFiles.length} tables for page ${pageId}`);
      return restoredFiles;
    } catch (error) {
      console.error('Failed to restore tables:', error);
      return [];
    }
  }
  
  /**
   * Clear persisted tables for a page
   */
  public async clearPageTables(pageId: string): Promise<void> {
    try {
      await duckDBPersistence.clearPageTables(pageId);
    } catch (error) {
      console.error('Failed to clear page tables:', error);
    }
  }

  /**
   * PROGRESSIVE LOADING METHODS
   * Task #80: Implement Progressive Data Loading
   *
   * These methods enable streaming table creation to prevent memory spikes
   * with large datasets
   */

  /**
   * Create table from streaming data chunks
   * Avoids loading entire dataset into memory at once
   *
   * @param tableName - Name of the table to create
   * @param dataStream - AsyncGenerator yielding data chunks
   * @param schema - Table schema (from first chunk)
   * @param pageId - Optional page ID for persistence
   * @param onProgress - Optional progress callback
   */
  public async createTableFromStream(
    tableName: string,
    dataStream: AsyncGenerator<any[]>,
    schema: { columns: Array<{ name: string; type: string }> },
    pageId?: string,
    onProgress?: (loaded: number, total?: number) => void
  ): Promise<void> {
    try {
      const conn = await this.getConnection();

      // Drop table if exists
      await conn.query(`DROP TABLE IF EXISTS ${tableName}`);

      // Process columns: normalize names and handle empty names
      let unnamedColumnCount = 0;
      const processedColumns = schema.columns.map(col => {
        let columnName = col.name ? col.name.trim() : '';

        // If column name is empty, give it a dummy name
        if (!columnName) {
          unnamedColumnCount++;
          columnName = `column_${unnamedColumnCount}`;
          console.log(`Warning: Empty column name replaced with "${columnName}"`);
        } else {
          // Normalize column name to match DuckDB behavior
          columnName = this.normalizeColumnName(columnName);
        }

        return {
          ...col,
          name: columnName,
          originalName: col.name || columnName
        };
      });

      // Create empty table with schema
      const columnDefs = processedColumns.map(col => {
        let duckdbType = 'VARCHAR';
        switch (col.type.toLowerCase()) {
          case 'number':
            duckdbType = 'DOUBLE';
            break;
          case 'boolean':
            duckdbType = 'BOOLEAN';
            break;
          case 'date':
            duckdbType = 'DATE';
            break;
          case 'datetime':
            duckdbType = 'TIMESTAMP';
            break;
          default:
            duckdbType = 'VARCHAR';
        }
        return `"${col.name}" ${duckdbType}`;
      }).join(', ');

      await conn.query(`CREATE TABLE ${tableName} (${columnDefs})`);
      console.log(`Table ${tableName} created with streaming schema`);

      // Insert chunks as they arrive
      let totalRowsInserted = 0;
      let chunkCount = 0;

      for await (const chunk of dataStream) {
        if (!chunk || chunk.length === 0) continue;

        // Prepare values for insertion
        const values = chunk.map(row => {
          const vals = processedColumns.map((col) => {
            const val = row[col.originalName];

            if (val === null || val === undefined) return 'NULL';

            // Handle different data types
            if (typeof val === 'string' || col.type === 'string' || col.type === 'VARCHAR') {
              return `'${String(val).replace(/'/g, "''")}'`;
            } else if (col.type === 'date' || col.type === 'datetime' || col.type === 'DATE') {
              if (typeof val === 'number') {
                const date = new Date(val);
                if (!isNaN(date.getTime())) {
                  return `'${date.toISOString().split('T')[0]}'`;
                }
              }
              return `'${String(val).replace(/'/g, "''")}'`;
            } else if (typeof val === 'boolean') {
              return val ? 'TRUE' : 'FALSE';
            }

            return val;
          }).join(', ');
          return `(${vals})`;
        });

        // Insert chunk in batches
        const batchSize = 1000;
        for (let i = 0; i < values.length; i += batchSize) {
          const batch = values.slice(i, i + batchSize).join(', ');
          await conn.query(`INSERT INTO ${tableName} VALUES ${batch}`);
        }

        totalRowsInserted += chunk.length;
        chunkCount++;

        // Report progress
        if (onProgress) {
          onProgress(totalRowsInserted);
        }

        console.log(`Inserted chunk ${chunkCount} (${chunk.length} rows, total: ${totalRowsInserted})`);
      }

      console.log(`Table ${tableName} created progressively with ${totalRowsInserted} rows in ${chunkCount} chunks`);

      // Persist to IndexedDB if pageId is provided
      if (pageId) {
        await duckDBPersistence.persistTable(tableName, pageId, schema, totalRowsInserted);
      }

    } catch (error) {
      console.error('Failed to create table from stream:', error);
      throw error;
    }
  }

  /**
   * Insert a single chunk of data into an existing table
   * Useful for incremental updates
   */
  public async insertChunk(
    tableName: string,
    chunk: any[],
    schema: { columns: Array<{ name: string; type: string }> }
  ): Promise<number> {
    try {
      if (!chunk || chunk.length === 0) return 0;

      const conn = await this.getConnection();

      // Process columns
      const processedColumns = schema.columns.map(col => ({
        ...col,
        name: this.normalizeColumnName(col.name),
        originalName: col.name
      }));

      // Prepare values
      const values = chunk.map(row => {
        const vals = processedColumns.map((col) => {
          const val = row[col.originalName];

          if (val === null || val === undefined) return 'NULL';

          if (typeof val === 'string') {
            return `'${String(val).replace(/'/g, "''")}'`;
          } else if (typeof val === 'boolean') {
            return val ? 'TRUE' : 'FALSE';
          }

          return val;
        }).join(', ');
        return `(${vals})`;
      });

      // Insert in batches
      const batchSize = 1000;
      let insertedRows = 0;

      for (let i = 0; i < values.length; i += batchSize) {
        const batch = values.slice(i, i + batchSize).join(', ');
        await conn.query(`INSERT INTO ${tableName} VALUES ${batch}`);
        insertedRows += Math.min(batchSize, values.length - i);
      }

      return insertedRows;
    } catch (error) {
      console.error('Failed to insert chunk:', error);
      throw error;
    }
  }

  /**
   * Get current memory usage estimate
   * Useful for monitoring during progressive loading
   */
  public async getMemoryUsage(): Promise<{
    tableCount: number;
    estimatedMB: number;
  }> {
    try {
      const tables = await this.getTables();
      let totalRows = 0;

      for (const table of tables) {
        const count = await this.getTableRowCount(table);
        totalRows += count;
      }

      // Rough estimate: assume 1KB per row
      const estimatedBytes = totalRows * 1024;
      const estimatedMB = estimatedBytes / (1024 * 1024);

      return {
        tableCount: tables.length,
        estimatedMB: Math.round(estimatedMB * 100) / 100
      };
    } catch (error) {
      console.error('Failed to get memory usage:', error);
      return { tableCount: 0, estimatedMB: 0 };
    }
  }
}

// Export singleton instance getter
export const getDuckDB = () => DuckDBService.getInstance();