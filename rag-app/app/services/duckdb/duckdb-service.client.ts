import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export class DuckDBService {
  private static instance: DuckDBService | null = null;
  private db: AsyncDuckDB | null = null;
  private connection: AsyncDuckDBConnection | null = null;
  private isInitialized = false;
  private initializationError: Error | null = null;

  private constructor() {}

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

  public async executeQuery(query: string): Promise<any[]> {
    try {
      const conn = await this.getConnection();
      const result = await conn.query(query);
      return result.toArray();
    } catch (error) {
      console.error('Query execution failed:', error);
      return [];
    }
  }

  public async createTableFromCSV(tableName: string, csvData: string): Promise<void> {
    try {
      const conn = await this.getConnection();
      
      // First, create a temporary file in DuckDB's virtual file system
      await this.db!.registerFileText(`${tableName}.csv`, csvData);
      
      // Create table from CSV
      await conn.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} AS 
        SELECT * FROM read_csv_auto('${tableName}.csv', header=true)
      `);
      
      console.log(`Table ${tableName} created successfully`);
    } catch (error) {
      console.error('Failed to create table from CSV:', error);
      throw error;
    }
  }

  public async createTableFromJSON(tableName: string, jsonData: any[]): Promise<void> {
    try {
      const conn = await this.getConnection();
      
      // Convert JSON to CSV format for DuckDB
      if (jsonData.length === 0) {
        throw new Error('Cannot create table from empty data');
      }
      
      // Register JSON data
      const jsonString = JSON.stringify(jsonData);
      await this.db!.registerFileText(`${tableName}.json`, jsonString);
      
      // Create table from JSON
      await conn.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} AS 
        SELECT * FROM read_json_auto('${tableName}.json')
      `);
      
      console.log(`Table ${tableName} created from JSON successfully`);
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
    schema?: { columns: Array<{ name: string; type: string }> }
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
        const columnDefs = schema.columns.map(col => {
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
        
        // Prepare data for insertion
        const values = data.map(row => {
          const vals = schema.columns.map(col => {
            const val = row[col.name];
            if (val === null || val === undefined) return 'NULL';
            if (col.type === 'string' || col.type === 'date' || col.type === 'datetime') {
              return `'${String(val).replace(/'/g, "''")}'`;
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
        // Use JSON import for automatic schema detection
        const jsonString = JSON.stringify(data);
        await this.db!.registerFileText(`${tableName}_import.json`, jsonString);
        
        await conn.query(`
          CREATE TABLE ${tableName} AS 
          SELECT * FROM read_json_auto('${tableName}_import.json')
        `);
      }
      
      console.log(`Table ${tableName} created with ${data.length} rows`);
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
}

// Export singleton instance getter
export const getDuckDB = () => DuckDBService.getInstance();