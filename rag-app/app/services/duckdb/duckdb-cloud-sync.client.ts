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
   * Validate and clean file metadata to detect corrupted exports
   */
  private validateFileMetadata(file: any): boolean {
    // Check for corrupted nested schema structure
    if (file.schema?.schema?.fields && !file.data) {
      console.warn('[CloudSync] Detected corrupted file metadata with nested schema and no data:', {
        tableName: file.tableName,
        hasNestedSchema: true,
        keys: Object.keys(file)
      });
      return false;
    }
    
    // Valid file should have tableName at minimum
    // parquetUrl is optional - files may be stored differently
    if (!file.tableName) {
      console.warn('[CloudSync] Invalid file metadata: missing tableName', {
        tableName: file.tableName,
        filename: file.filename
      });
      return false;
    }
    
    return true;
  }
  
  /**
   * Load files from cloud storage for a page
   */
  public async loadFilesFromCloud(pageId: string, workspaceId: string): Promise<CloudDataFile[]> {
    try {
      console.log(`[CloudSync] Loading files for page ${pageId}`);
      
      // Fetch file metadata from API with credentials
      const response = await fetch(`/api/data/files/${pageId}`, {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include' // Ensure auth cookies are sent
      });
      console.log('[CloudSync] API Response status:', response.status, response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[CloudSync] API Error:', {
          status: response.status,
          error: errorText
        });
        
        if (response.status === 401 || response.status === 403) {
          console.warn('[CloudSync] Authentication required to load cloud files');
          console.info('[CloudSync] 💡 Files uploaded in this session will be available locally.');
          console.info('[CloudSync] To persist files across sessions, please use a regular browser window and log in.');
          // Return empty array instead of throwing for auth issues
          // This allows local-only usage in incognito
          return [];
        }
        
        throw new Error('Failed to fetch files from cloud');
      }
      
      const responseData = await response.json();
      console.log('[CloudSync] API Response data:', {
        hasFiles: !!responseData.files,
        filesLength: responseData.files?.length,
        keys: Object.keys(responseData),
        firstFile: responseData.files?.[0]
      });
      
      const { files } = responseData;
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
      const corruptedFiles: any[] = [];
      
      // Process each file
      for (const file of files) {
        try {
          // Validate file metadata first
          if (!this.validateFileMetadata(file)) {
            console.warn(`[CloudSync] Skipping invalid/corrupted file: ${file.tableName}`);
            corruptedFiles.push(file);
            continue;
          }
          // Check if table already exists locally
          const tableExists = await this.tableExists(file.tableName);
          
          if (!tableExists && file.parquetUrl) {
            console.log(`[CloudSync] Restoring table ${file.tableName} from cloud`);
            
            // Download and restore Parquet file
            await this.restoreTableFromParquet(file.tableName, file.parquetUrl, pageId);
            
            console.log(`[CloudSync] Table ${file.tableName} restored successfully`);
            
            // Add to loaded files only if restoration was successful
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
          } else if (tableExists) {
            console.log(`[CloudSync] Table ${file.tableName} already exists locally`);
            
            // Add to loaded files since it exists
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
          } else if (!file.parquetUrl) {
            console.warn(`[CloudSync] No storage URL for table ${file.tableName}, skipping`);
          }
        } catch (error) {
          console.error(`[CloudSync] Failed to restore table ${file.tableName}:`, error);
          // Continue with other files even if one fails
        }
      }
      
      // Report on corrupted files if any
      if (corruptedFiles.length > 0) {
        console.error('[CloudSync] Found corrupted files that need re-export:', {
          count: corruptedFiles.length,
          files: corruptedFiles.map(f => ({
            tableName: f.tableName,
            id: f.id,
            hasNestedSchema: !!f.schema?.schema?.fields
          }))
        });
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
  private async restoreTableFromParquet(tableName: string, parquetUrl: string, pageId: string): Promise<void> {
    try {
      console.log(`[CloudSync] Fetching table data from: ${parquetUrl}`);
      
      // Download table data (JSON format for now, Parquet later)
      const response = await fetch(parquetUrl);
      
      console.log(`[CloudSync] Fetch response:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: {
          contentType: response.headers.get('content-type'),
          contentLength: response.headers.get('content-length')
        }
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[CloudSync] Failed to fetch from storage:`, {
          url: parquetUrl,
          status: response.status,
          body: errorBody
        });
        throw new Error(`Failed to download table data: ${response.status} ${response.statusText}`);
      }
      
      const responseText = await response.text();
      console.log(`[CloudSync] Response preview:`, responseText.substring(0, 500));
      
      let exportData;
      try {
        exportData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[CloudSync] Failed to parse JSON:', parseError);
        console.error('[CloudSync] Raw response:', responseText);
        throw new Error('Response is not valid JSON');
      }
      
      console.log('[CloudSync] Parsed export data structure:', {
        hasTableName: !!exportData.tableName,
        hasSchema: !!exportData.schema,
        hasData: !!exportData.data,
        hasRowCount: !!exportData.rowCount,
        keys: Object.keys(exportData),
        schemaLength: Array.isArray(exportData.schema) ? exportData.schema.length : 'not array',
        dataLength: Array.isArray(exportData.data) ? exportData.data.length : 'not array'
      });
      
      // Handle both old format (nested schema) and new format (direct data)
      let dataToImport = exportData.data;
      
      // If the data is missing but we have a schema field, check if it's the old format
      if (!dataToImport && exportData.schema?.schema?.fields) {
        console.warn('[CloudSync] Detected old export format with nested schema, attempting to extract data');
        // This appears to be metadata only, no actual data
        console.error('[CloudSync] Old format detected but no data field found');
        throw new Error('Export file contains only metadata, no data');
      }
      
      // Validate the export data
      if (!dataToImport || !Array.isArray(dataToImport)) {
        console.error('[CloudSync] Invalid export data structure:', {
          hasData: !!dataToImport,
          isArray: Array.isArray(dataToImport),
          exportDataKeys: Object.keys(exportData),
          exportDataSample: JSON.stringify(exportData).substring(0, 500)
        });
        throw new Error('Invalid export data format: missing or invalid data array');
      }
      
      // Load into DuckDB
      const duckdb = getDuckDB();
      const conn = await duckdb.getConnection();
      
      // Create table and insert data
      if (dataToImport.length > 0) {
        console.log(`[CloudSync] Creating table ${tableName} with ${dataToImport.length} rows`);
        console.log('[CloudSync] Sample data row:', dataToImport[0]);
        
        // Convert schema format from export to what createTableFromData expects
        let schemaForTable = undefined;
        if (exportData.schema && Array.isArray(exportData.schema)) {
          schemaForTable = {
            columns: exportData.schema.map((col: any) => {
              const columnName = col.column_name || col.name;
              const dataType = col.data_type || col.type;
              
              // Normalize DuckDB types to our internal types
              let normalizedType = 'string';
              if (dataType) {
                const upperType = dataType.toUpperCase();
                if (upperType.includes('INT') || upperType.includes('DOUBLE') || 
                    upperType.includes('FLOAT') || upperType.includes('DECIMAL') ||
                    upperType.includes('NUMERIC') || upperType.includes('BIGINT')) {
                  normalizedType = 'number';
                } else if (upperType.includes('BOOL')) {
                  normalizedType = 'boolean';
                } else if (upperType.includes('DATE') || upperType.includes('TIME')) {
                  normalizedType = 'date';
                } else {
                  // Default to string for VARCHAR, TEXT, etc.
                  normalizedType = 'string';
                }
              }
              
              return {
                name: columnName,
                type: normalizedType
              };
            })
          };
          console.log('[CloudSync] Converted schema:', schemaForTable);
        }
        
        // Use createTableFromData with correct parameters
        await duckdb.createTableFromData(
          tableName,
          dataToImport,
          schemaForTable,  // Pass the schema (optional)
          pageId          // Pass the pageId for persistence
        );
        
        console.log(`[CloudSync] Table ${tableName} created with ${dataToImport.length} rows`);
      } else {
        console.warn(`[CloudSync] No data found for table ${tableName}`);
      }
      
      console.log(`[CloudSync] Table ${tableName} restored from cloud`);
      
      // Persistence is handled by createTableFromData when pageId is provided
      
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
  
  /**
   * Clean up corrupted files by attempting to re-export from local DuckDB if available
   */
  public async cleanupCorruptedFiles(
    pageId: string,
    workspaceId: string
  ): Promise<{ fixed: string[], failed: string[] }> {
    const fixed: string[] = [];
    const failed: string[] = [];
    
    try {
      // Get all files from cloud
      const response = await fetch(`/api/data/files/${pageId}`, {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include' // Ensure auth cookies are sent
      });
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      
      const { files } = await response.json();
      
      for (const file of files) {
        // Check if file is corrupted
        if (!this.validateFileMetadata(file)) {
          console.log(`[CloudSync] Attempting to fix corrupted file: ${file.tableName}`);
          
          // Check if table exists locally
          if (await this.tableExists(file.tableName)) {
            try {
              // Re-export the table
              const { DuckDBExportService } = await import('./duckdb-export.client');
              const exportService = DuckDBExportService.getInstance();
              
              const supabaseUrl = window.ENV?.SUPABASE_URL;
              const supabaseAnonKey = window.ENV?.SUPABASE_ANON_KEY;
              
              if (supabaseUrl && supabaseAnonKey) {
                const newUrl = await exportService.exportAndUploadToStorage(
                  file.tableName,
                  workspaceId,
                  supabaseUrl,
                  supabaseAnonKey
                );
                
                if (newUrl) {
                  // Update the file metadata
                  // Note: This would require an API endpoint to update the parquetUrl
                  console.log(`[CloudSync] Successfully re-exported ${file.tableName}`);
                  fixed.push(file.tableName);
                } else {
                  failed.push(file.tableName);
                }
              }
            } catch (error) {
              console.error(`[CloudSync] Failed to re-export ${file.tableName}:`, error);
              failed.push(file.tableName);
            }
          } else {
            console.warn(`[CloudSync] Cannot fix ${file.tableName} - table not found locally`);
            failed.push(file.tableName);
          }
        }
      }
      
      return { fixed, failed };
    } catch (error) {
      console.error('[CloudSync] Failed to cleanup corrupted files:', error);
      return { fixed, failed };
    }
  }
}