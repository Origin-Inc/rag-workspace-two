import { DuckDBService } from './duckdb-service.client';

export class DuckDBExportService {
  private static instance: DuckDBExportService;
  private duckdb: DuckDBService;
  
  private constructor() {
    this.duckdb = DuckDBService.getInstance();
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
      const data = await this.duckdb.query(`SELECT * FROM ${tableName}`);
      
      // Get table schema
      const schemaResult = await this.duckdb.query(`
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
      const tablePath = `tables/${workspaceId}/${timestamp}_${tableName}.json`;
      
      // Import Supabase client dynamically
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data, error } = await supabase.storage
        .from('duckdb-tables')
        .upload(tablePath, tableBlob, {
          contentType: 'application/json',
          upsert: true,
        });
      
      if (error) {
        console.error('[DuckDBExport] Failed to upload Parquet to storage:', error);
        return null;
      }
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('duckdb-tables')
        .getPublicUrl(tablePath);
      
      console.log('[DuckDBExport] Table data uploaded successfully:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error) {
      console.error('[DuckDBExport] Failed to export and upload:', error);
      return null;
    }
  }
}