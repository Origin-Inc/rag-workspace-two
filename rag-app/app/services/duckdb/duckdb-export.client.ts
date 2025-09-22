import { getDuckDB } from './duckdb-service.client';

export class DuckDBExportService {
  private static instance: DuckDBExportService;
  private duckdb: ReturnType<typeof getDuckDB>;
  
  private constructor() {
    this.duckdb = getDuckDB();
  }
  
  static getInstance(): DuckDBExportService {
    if (!DuckDBExportService.instance) {
      DuckDBExportService.instance = new DuckDBExportService();
    }
    return DuckDBExportService.instance;
  }
  
  /**
   * Export a DuckDB table as JSON for cloud storage
   */
  async exportTableAsJSON(tableName: string): Promise<Blob> {
    try {
      console.log('[DuckDBExport] Exporting table as JSON:', tableName);
      
      // Get table data
      const data = await this.duckdb.executeQuery(`SELECT * FROM ${tableName}`);
      
      // Get table schema
      const schemaResult = await this.duckdb.executeQuery(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `);
      
      // Create export object with data and schema
      const exportData = {
        tableName,
        schema: schemaResult,
        data: data,
        rowCount: data.length,
        exportedAt: new Date().toISOString(),
      };
      
      const jsonString = JSON.stringify(exportData);
      return new Blob([jsonString], { type: 'application/json' });
    } catch (error) {
      console.error('[DuckDBExport] Failed to export table:', error);
      throw error;
    }
  }
  
  /**
   * Export table and upload to Supabase Storage
   */
  async exportAndUploadToStorage(
    tableName: string,
    workspaceId: string,
    supabaseUrl: string,
    supabaseKey: string
  ): Promise<string | null> {
    try {
      // Export table as JSON (Parquet export from browser not supported)
      const tableBlob = await this.exportTableAsJSON(tableName);
      
      // Upload to Supabase Storage
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      const tablePath = `tables/${workspaceId}/${timestamp}_${tableName}_${randomSuffix}.json`;
      
      console.log('[DuckDBExport] Uploading to path:', tablePath);
      console.log('[DuckDBExport] Blob size:', tableBlob.size, 'bytes');
      
      // Import Supabase client dynamically
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });
      
      // Check if we have a session
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[DuckDBExport] Auth session exists:', !!session);
      
      const { data, error } = await supabase.storage
        .from('duckdb-tables')
        .upload(tablePath, tableBlob, {
          contentType: 'application/json',
          upsert: true,
          cacheControl: '3600'
        });
      
      if (error) {
        console.error('[DuckDBExport] Failed to upload to storage:', {
          error: error.message,
          statusCode: error.statusCode || 'unknown',
          details: error
        });
        
        // Try to provide more specific error info
        if (error.message?.includes('row-level security')) {
          console.error('[DuckDBExport] RLS policy violation - user may not be authenticated');
        } else if (error.message?.includes('Bucket not found')) {
          console.error('[DuckDBExport] Storage bucket "duckdb-tables" does not exist');
        }
        
        return null;
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('duckdb-tables')
        .getPublicUrl(tablePath);
      
      console.log('[DuckDBExport] Table data uploaded successfully:', {
        path: data?.path,
        publicUrl: urlData.publicUrl
      });
      
      return urlData.publicUrl;
    } catch (error) {
      console.error('[DuckDBExport] Failed to export and upload:', error);
      return null;
    }
  }
}