import { getDuckDB } from './duckdb-service.client';
import type { DataFile } from '~/stores/chat-store';

interface PersistedTable {
  tableName: string;
  data: any[];
  schema: any;
  rowCount: number;
  timestamp: number;
  originalFilename?: string;  // Store the original filename with extension
}

interface DBSchema {
  tables: {
    key: string;
    value: PersistedTable;
  };
}

export class DuckDBPersistenceService {
  private static instance: DuckDBPersistenceService;
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'duckdb-persistence';
  private readonly DB_VERSION = 1;
  private readonly STORE_NAME = 'tables';

  private constructor() {}

  public static getInstance(): DuckDBPersistenceService {
    if (!DuckDBPersistenceService.instance) {
      DuckDBPersistenceService.instance = new DuckDBPersistenceService();
    }
    return DuckDBPersistenceService.instance;
  }

  /**
   * Initialize IndexedDB
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'tableName' });
        }
      };
    });
  }

  /**
   * Save table data to IndexedDB
   */
  public async persistTable(
    tableName: string,
    pageId: string,
    schema: any,
    rowCount: number,
    originalFilename?: string
  ): Promise<void> {
    try {
      const duckdb = getDuckDB();
      if (!duckdb.isReady()) {
        await duckdb.initialize();
      }

      const conn = await duckdb.getConnection();
      
      // Export table data as JSON - convert to plain objects
      const result = await conn.query(`SELECT * FROM ${tableName}`);
      const rows = result.toArray();
      
      // Convert Row objects to plain JavaScript objects
      const data = rows.map(row => {
        const plainObj: any = {};
        for (const key in row) {
          plainObj[key] = row[key];
        }
        return plainObj;
      });
      
      // Store in IndexedDB with page context
      const db = await this.initDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const persistedTable: PersistedTable = {
        tableName: `${pageId}_${tableName}`,
        data,
        schema,
        rowCount,
        timestamp: Date.now(),
        originalFilename: originalFilename,
      };
      
      await new Promise((resolve, reject) => {
        const request = store.put(persistedTable);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
      
      console.log(`✅ Persisted table ${tableName} with ${rowCount} rows to IndexedDB`);
    } catch (error) {
      console.error(`Failed to persist table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Restore tables from IndexedDB
   */
  public async restoreTables(pageId: string): Promise<DataFile[]> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      
      // Get all tables for this page
      const allTables = await new Promise<PersistedTable[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      
      // Filter tables for this page
      const pageTables = allTables.filter(t => 
        t.tableName.startsWith(`${pageId}_`)
      );
      
      if (pageTables.length === 0) {
        console.log(`No persisted tables found for page ${pageId}`);
        return [];
      }
      
      const duckdb = getDuckDB();
      if (!duckdb.isReady()) {
        await duckdb.initialize();
      }
      
      const conn = await duckdb.getConnection();
      const restoredFiles: DataFile[] = [];
      
      for (const table of pageTables) {
        try {
          // Extract original table name
          const originalTableName = table.tableName.replace(`${pageId}_`, '');
          
          // Recreate table from JSON data
          if (table.data && table.data.length > 0) {
            // Fix schema for restoration - dates are stored as strings in JSON
            const restorationSchema = table.schema ? {
              ...table.schema,
              columns: table.schema.columns?.map((col: any) => ({
                ...col,
                // Keep dates as strings to avoid conversion errors
                type: col.type === 'date' || col.type === 'datetime' ? 'string' : col.type
              }))
            } : table.schema;
            
            // Convert Unix timestamp values to date strings for date/datetime columns
            const processedData = table.data.map((row: any) => {
              const processedRow = { ...row };
              if (table.schema && table.schema.columns) {
                table.schema.columns.forEach((col: any) => {
                  if ((col.type === 'date' || col.type === 'datetime') && processedRow[col.name]) {
                    const val = processedRow[col.name];
                    // Check if it's a Unix timestamp (number or numeric string)
                    if (typeof val === 'number' || /^\d+$/.test(val)) {
                      const timestamp = typeof val === 'string' ? parseInt(val) : val;
                      // Convert to ISO date string
                      processedRow[col.name] = new Date(timestamp).toISOString();
                    }
                  }
                });
              }
              return processedRow;
            });
            
            // Use the DuckDB service method to create table from data
            await duckdb.createTableFromData(originalTableName, processedData, restorationSchema);
            
            // Create DataFile metadata
            // Use original filename if available, otherwise default to .csv
            const filename = table.originalFilename || `${originalTableName}.csv`;
            
            restoredFiles.push({
              id: `restored_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              pageId,
              filename: filename,
              tableName: originalTableName,
              schema: table.schema,
              rowCount: table.rowCount,
              sizeBytes: JSON.stringify(table.data).length,
              uploadedAt: new Date(table.timestamp),
            });
            
            console.log(`✅ Restored table ${originalTableName} with ${table.rowCount} rows`);
          }
        } catch (error) {
          console.error(`Failed to restore table ${table.tableName}:`, error);
        }
      }
      
      return restoredFiles;
    } catch (error) {
      console.error('Failed to restore tables from IndexedDB:', error);
      return [];
    }
  }

  /**
   * Clear persisted tables for a page
   */
  public async clearPageTables(pageId: string): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      // Get all tables for this page
      const allTables = await new Promise<PersistedTable[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      
      // Delete tables for this page
      const pageTables = allTables.filter(t => 
        t.tableName.startsWith(`${pageId}_`)
      );
      
      for (const table of pageTables) {
        await new Promise((resolve, reject) => {
          const request = store.delete(table.tableName);
          request.onsuccess = resolve;
          request.onerror = () => reject(request.error);
        });
      }
      
      console.log(`Cleared ${pageTables.length} persisted tables for page ${pageId}`);
    } catch (error) {
      console.error('Failed to clear page tables:', error);
    }
  }

  /**
   * Get metadata for persisted tables
   */
  public async getPersistedTableMetadata(pageId: string): Promise<{
    tableName: string;
    rowCount: number;
    timestamp: number;
  }[]> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const allTables = await new Promise<PersistedTable[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
      
      return allTables
        .filter(t => t.tableName.startsWith(`${pageId}_`))
        .map(t => ({
          tableName: t.tableName.replace(`${pageId}_`, ''),
          rowCount: t.rowCount,
          timestamp: t.timestamp,
        }));
    } catch (error) {
      console.error('Failed to get persisted table metadata:', error);
      return [];
    }
  }
}

// Export singleton instance
export const duckDBPersistence = DuckDBPersistenceService.getInstance();