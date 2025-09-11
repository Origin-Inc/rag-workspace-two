import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export class DuckDBService {
  private static instance: DuckDBService | null = null;
  private db: AsyncDuckDB | null = null;
  private connection: AsyncDuckDBConnection | null = null;
  private isInitialized = false;

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

    try {
      // Get the bundles from jsDelivr CDN
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      
      // Select the best bundle for the current browser
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
      
      // Create a worker for DuckDB
      const worker = await duckdb.createWorker(bundle.mainWorker!);
      
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
      throw new Error(`DuckDB initialization failed: ${error}`);
    }
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
    const conn = await this.getConnection();
    const result = await conn.query(query);
    return result.toArray();
  }

  public async createTableFromCSV(tableName: string, csvData: string): Promise<void> {
    const conn = await this.getConnection();
    
    // First, create a temporary file in DuckDB's virtual file system
    await this.db!.registerFileText(`${tableName}.csv`, csvData);
    
    // Create table from CSV
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} AS 
      SELECT * FROM read_csv_auto('${tableName}.csv', header=true)
    `);
    
    console.log(`Table ${tableName} created successfully`);
  }

  public async createTableFromJSON(tableName: string, jsonData: any[]): Promise<void> {
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
  }

  public async getTableSchema(tableName: string): Promise<any[]> {
    const conn = await this.getConnection();
    const result = await conn.query(`DESCRIBE ${tableName}`);
    return result.toArray();
  }

  public async getTables(): Promise<string[]> {
    const conn = await this.getConnection();
    const result = await conn.query(`SHOW TABLES`);
    const tables = result.toArray();
    return tables.map((row: any) => row.name || row.Name);
  }

  public async dropTable(tableName: string): Promise<void> {
    const conn = await this.getConnection();
    await conn.query(`DROP TABLE IF EXISTS ${tableName}`);
    console.log(`Table ${tableName} dropped`);
  }

  public async cleanup(): Promise<void> {
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
  }

  public async getTableRowCount(tableName: string): Promise<number> {
    const conn = await this.getConnection();
    const result = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const data = result.toArray();
    return data[0]?.count || 0;
  }

  public async getTableSample(tableName: string, limit: number = 10): Promise<any[]> {
    const conn = await this.getConnection();
    const result = await conn.query(`SELECT * FROM ${tableName} LIMIT ${limit}`);
    return result.toArray();
  }
}

// Export singleton instance getter
export const getDuckDB = () => DuckDBService.getInstance();