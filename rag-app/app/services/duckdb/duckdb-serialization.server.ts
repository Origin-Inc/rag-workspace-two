import { Database } from 'duckdb-async';
import type { FileStorageService } from '../storage/file-storage.server';

export class DuckDBSerializationService {
  private db: Database | null = null;
  
  /**
   * Initialize DuckDB connection
   */
  private async initializeDB(): Promise<void> {
    if (!this.db) {
      console.log('[DuckDBSerializationService] Initializing DuckDB...');
      try {
        this.db = await Database.create(':memory:');
        console.log('[DuckDBSerializationService] DuckDB initialized successfully');
      } catch (error) {
        console.error('[DuckDBSerializationService] Failed to initialize DuckDB:', error);
        throw new Error(`Failed to initialize DuckDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
  
  /**
   * Load data into DuckDB and export to Parquet format
   * Returns both the Parquet buffer AND the updated schema with renamed columns
   */
  async serializeToParquet(
    data: any[],
    schema: any,
    tableName: string
  ): Promise<{ buffer: Buffer; schema: any }> {
    try {
      console.log(`[DuckDBSerializationService] Starting serialization for table: ${tableName}`);
      console.log(`[DuckDBSerializationService] Data rows: ${data.length}, Schema columns: ${schema.columns?.length || 0}`);

      // Ensure DB is initialized
      await this.initializeDB();

      if (!this.db) {
        throw new Error('DuckDB not initialized');
      }

      // Create table from data and get updated schema
      const updatedSchema = await this.createTableFromData(data, schema, tableName);

      // Export to Parquet buffer
      const parquetBuffer = await this.exportTableToParquet(tableName);

      console.log(`[DuckDBSerializationService] Serialization complete: ${parquetBuffer.length} bytes`);
      return {
        buffer: parquetBuffer,
        schema: updatedSchema
      };
    } catch (error) {
      console.error('[DuckDBSerializationService] Failed to serialize to Parquet:', error);
      throw error;
    }
  }
  
  /**
   * Create a DuckDB table from data
   * Returns updated schema with renamed columns
   */
  private async createTableFromData(
    data: any[],
    schema: any,
    tableName: string
  ): Promise<any> {
    if (!this.db) {
      throw new Error('DuckDB not initialized');
    }

    console.log(`[DuckDBSerializationService] Creating table: ${tableName}`);

    // Generate CREATE TABLE statement from schema
    // CRITICAL FIX: Rename columns with empty names (pandas index, unnamed columns)
    // Always wrap column names in quotes to handle spaces, special chars, etc.
    const processedColumns = schema.columns.map((col: any, index: number) => {
      let columnName = col.name?.trim();

      // Rename empty/unnamed columns with placeholder names
      if (!columnName || columnName === '') {
        columnName = `unnamed_column_${index}`;
        console.log(`[DuckDBSerializationService] ⚠️ Renamed empty column at index ${index} to "${columnName}"`);
      }

      return {
        originalName: col.name,
        name: columnName,
        type: col.type
      };
    });

    // Build CREATE TABLE with quoted column names (handles spaces, special chars)
    const columns = processedColumns.map((col: any) => {
      const duckdbType = this.mapTypeToDuckDB(col.type);
      return `"${col.name}" ${duckdbType}`;  // Always quoted
    }).join(', ');

    const createTableSQL = `CREATE TABLE ${tableName} (${columns})`;
    console.log(`[DuckDBSerializationService] SQL: ${createTableSQL}`);

    await this.db.all(createTableSQL);

    // Insert data - map original column names to new names
    if (data.length > 0) {
      const placeholders = processedColumns.map(() => '?').join(', ');
      const insertSQL = `INSERT INTO ${tableName} VALUES (${placeholders})`;

      const stmt = await this.db.prepare(insertSQL);
      for (const row of data) {
        const values = processedColumns.map((col: any) => {
          // Use original name to get value from row
          const value = row[col.originalName];
          
          // Handle null/undefined values
          if (value === null || value === undefined) {
            return null;
          }
          
          // Handle empty strings for numeric columns
          if (value === '' && (col.type === 'number' || col.type === 'integer')) {
            return null;
          }
          
          return value;
        });
        await stmt.run(...values);
      }
      await stmt.finalize();
    }

    // Return updated schema with renamed columns
    return {
      ...schema,
      columns: processedColumns.map((col: any) => ({
        name: col.name,  // Use new name
        type: col.type
      }))
    };
  }
  
  /**
   * Export a table to Parquet format
   */
  private async exportTableToParquet(tableName: string): Promise<Buffer> {
    if (!this.db) {
      throw new Error('DuckDB not initialized');
    }
    
    // Use COPY TO with a temporary file path
    const tempPath = `/tmp/${tableName}_${Date.now()}.parquet`;
    
    console.log(`[DuckDBSerializationService] Exporting table to Parquet: ${tempPath}`);
    
    try {
      // Export to Parquet file
      await this.db.all(`COPY ${tableName} TO '${tempPath}' (FORMAT PARQUET)`);
      
      // Read the file into a buffer
      const fs = await import('fs/promises');
      const buffer = await fs.readFile(tempPath);
      
      // Clean up temp file
      await fs.unlink(tempPath);
      
      return buffer;
    } catch (error) {
      console.error('[DuckDBSerializationService] Failed to export to Parquet:', error);
      throw error;
    }
  }
  
  /**
   * Restore a table from Parquet data
   */
  async restoreFromParquet(
    parquetBuffer: Buffer,
    tableName: string
  ): Promise<{ rowCount: number; schema: any }> {
    try {
      // Ensure DB is initialized
      await this.initializeDB();
      
      if (!this.db) {
        throw new Error('DuckDB not initialized');
      }
      
      console.log(`[DuckDBSerializationService] Restoring table from Parquet: ${tableName}`);
      
      // Write buffer to temp file
      const tempPath = `/tmp/${tableName}_restore_${Date.now()}.parquet`;
      const fs = await import('fs/promises');
      await fs.writeFile(tempPath, parquetBuffer);
      
      // Create table from Parquet file
      await this.db.all(`
        CREATE TABLE ${tableName} AS 
        SELECT * FROM read_parquet('${tempPath}')
      `);
      
      // Get row count
      const countResult = await this.db.all(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rowCount = countResult[0].count;
      
      // Get schema
      const schemaResult = await this.db.all(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '${tableName}'
      `);
      
      const schema = {
        columns: schemaResult.map((col: any) => ({
          name: col.column_name,
          type: this.mapDuckDBTypeToJS(col.data_type)
        }))
      };
      
      // Clean up temp file
      await fs.unlink(tempPath);
      
      return { rowCount, schema };
    } catch (error) {
      console.error('[DuckDBSerializationService] Failed to restore from Parquet:', error);
      throw error;
    }
  }
  
  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      console.log('[DuckDBSerializationService] Closing DuckDB connection');
      try {
        await this.db.close();
        this.db = null;
      } catch (error) {
        console.error('[DuckDBSerializationService] Error closing DuckDB:', error);
      }
    }
  }
  
  /**
   * Map JavaScript types to DuckDB types
   */
  private mapTypeToDuckDB(jsType: string): string {
    const typeMap: Record<string, string> = {
      'string': 'VARCHAR',
      'number': 'DOUBLE',
      'integer': 'INTEGER',
      'boolean': 'BOOLEAN',
      'date': 'DATE',
      'datetime': 'TIMESTAMP',
      'object': 'JSON'
    };
    
    return typeMap[jsType.toLowerCase()] || 'VARCHAR';
  }
  
  /**
   * Map DuckDB types to JavaScript types
   */
  private mapDuckDBTypeToJS(duckdbType: string): string {
    const typeMap: Record<string, string> = {
      'VARCHAR': 'string',
      'TEXT': 'string',
      'INTEGER': 'integer',
      'BIGINT': 'integer',
      'DOUBLE': 'number',
      'REAL': 'number',
      'DECIMAL': 'number',
      'BOOLEAN': 'boolean',
      'DATE': 'date',
      'TIMESTAMP': 'datetime',
      'JSON': 'object'
    };
    
    const upperType = duckdbType.toUpperCase();
    for (const [dbType, jsType] of Object.entries(typeMap)) {
      if (upperType.includes(dbType)) {
        return jsType;
      }
    }
    
    return 'string';
  }
  
}