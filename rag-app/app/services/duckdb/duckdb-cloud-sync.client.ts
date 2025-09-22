import { getDuckDB } from './duckdb-service.client';
import type { DataFile } from '~/stores/chat-store';

interface CloudDataFile extends DataFile {
  id: string;
  storageUrl?: string | null;
  parquetUrl?: string | null;
  updatedAt?: string;
}

export class DuckDBCloudSyncService {
  private static instance: DuckDBCloudSyncService;
  
  private constructor() {}
  
  public static getInstance(): DuckDBCloudSyncService {
    if (!DuckDBCloudSyncService.instance) {
      DuckDBCloudSyncService.instance = new DuckDBCloudSyncService();
    }
    return DuckDBCloudSyncService.instance;
  }
  
  /**
   * Load files from cloud storage for a page
   */
  public async loadFilesFromCloud(pageId: string, workspaceId: string): Promise<CloudDataFile[]> {
    try {
      console.log(`[CloudSync] Loading files for page ${pageId}`);
      
      // Fetch file metadata from API
      const response = await fetch(`/api/data/files/${pageId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch files from cloud');
      }
      
      const { files } = await response.json();
      if (!files || files.length === 0) {
        console.log('[CloudSync] No cloud files found');
        return [];
      }
      
      console.log(`[CloudSync] Found ${files.length} files in cloud`);
      
      // Initialize DuckDB
      const duckdb = getDuckDB();
      if (!duckdb.isReady()) {
        await duckdb.initialize();
      }
      
      const loadedFiles: CloudDataFile[] = [];
      
      // Process each file
      for (const file of files) {
        try {
          // Check if table already exists locally
          const tableExists = await this.tableExists(file.tableName);
          
          if (!tableExists && file.parquetUrl) {
            console.log(`[CloudSync] Restoring table ${file.tableName} from cloud`);
            
            // Download and restore Parquet file
            await this.restoreTableFromParquet(file.tableName, file.parquetUrl);
            
            console.log(`[CloudSync] Table ${file.tableName} restored successfully`);
          } else if (tableExists) {
            console.log(`[CloudSync] Table ${file.tableName} already exists locally`);
          }
          
          loadedFiles.push({
            filename: file.filename,
            tableName: file.tableName,
            schema: file.schema,
            rowCount: file.rowCount,
            sizeBytes: file.sizeBytes,
            id: file.id,
            storageUrl: file.storageUrl,
            parquetUrl: file.parquetUrl,
            updatedAt: file.updatedAt
          });
        } catch (error) {
          console.error(`[CloudSync] Failed to restore table ${file.tableName}:`, error);
        }
      }
      
      return loadedFiles;
    } catch (error) {
      console.error('[CloudSync] Failed to load files from cloud:', error);
      return [];
    }
  }
  
  /**
   * Check if a table exists in DuckDB
   */
  private async tableExists(tableName: string): Promise<boolean> {
    try {
      const duckdb = getDuckDB();
      const conn = await duckdb.getConnection();
      
      // Try to query the table
      await conn.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Restore a table from Parquet URL
   */
  private async restoreTableFromParquet(tableName: string, parquetUrl: string): Promise<void> {
    try {
      // Download table data (JSON format for now, Parquet later)
      const response = await fetch(parquetUrl);
      if (!response.ok) {
        throw new Error(`Failed to download table data: ${response.statusText}`);
      }
      
      const exportData = await response.json();
      
      // Validate the export data
      if (!exportData.data || !Array.isArray(exportData.data)) {
        throw new Error('Invalid export data format');
      }
      
      // Load into DuckDB
      const duckdb = getDuckDB();
      const conn = await duckdb.getConnection();
      
      // Create table and insert data
      if (exportData.data.length > 0) {
        // Use createTableFromData if available
        const rowCount = await duckdb.createTableFromData(
          tableName,
          exportData.data,
          tableName // Use tableName as pageId
        );
        
        console.log(`[CloudSync] Table ${tableName} created with ${rowCount} rows`);
      } else {
        console.warn(`[CloudSync] No data found for table ${tableName}`);
      }
      
      console.log(`[CloudSync] Table ${tableName} restored from cloud`);
      
      // Also persist to IndexedDB for offline access
      const { DuckDBPersistenceService } = await import('./duckdb-persistence.client');
      const persistenceService = DuckDBPersistenceService.getInstance();
      
      // Get row count for persistence
      const countResult = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rows = countResult.toArray();
      const rowCount = rows[0]?.count || 0;
      
      // Get schema (simplified)
      const schemaResult = await conn.query(`SELECT * FROM ${tableName} LIMIT 1`);
      const schemaRow = schemaResult.toArray()[0];
      const schema = {
        columns: schemaRow ? Object.keys(schemaRow).map(name => ({
          name,
          type: typeof schemaRow[name]
        })) : []
      };
      
      // Persist to IndexedDB
      await persistenceService.persistTable(
        tableName,
        tableName, // Use tableName as pageId for now
        schema,
        rowCount
      );
      
    } catch (error) {
      console.error(`[CloudSync] Failed to restore from Parquet:`, error);
      throw error;
    }
  }
  
  /**
   * Sync local changes to cloud (future enhancement)
   */
  public async syncToCloud(tableName: string, pageId: string): Promise<boolean> {
    // TODO: Implement syncing local changes back to cloud
    console.log(`[CloudSync] Sync to cloud not yet implemented for ${tableName}`);
    return false;
  }
  
  /**
   * Get sync status for a table
   */
  public async getSyncStatus(tableName: string): Promise<{
    hasLocal: boolean;
    hasCloud: boolean;
    lastSynced?: Date;
  }> {
    const hasLocal = await this.tableExists(tableName);
    
    // TODO: Check cloud status via API
    const hasCloud = false;
    
    return {
      hasLocal,
      hasCloud,
      lastSynced: undefined
    };
  }
}