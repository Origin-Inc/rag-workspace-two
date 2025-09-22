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
    console.log('[DuckDBExport] 🚀 START exportAndUploadToStorage:', {
      tableName,
      workspaceId,
      supabaseUrl,
      hasKey: !!supabaseKey,
      keyPreview: supabaseKey ? `${supabaseKey.substring(0, 20)}...` : 'NO KEY'
    });
    
    try {
      // Step 1: Export table as JSON
      console.log('[DuckDBExport] 📦 STEP 1: Exporting table as JSON...');
      const tableBlob = await this.exportTableAsJSON(tableName);
      console.log('[DuckDBExport] ✅ Table exported to blob:', {
        size: tableBlob.size,
        type: tableBlob.type
      });
      
      // Step 2: Prepare upload path
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      const tablePath = `tables/${workspaceId}/${timestamp}_${tableName}_${randomSuffix}.json`;
      console.log('[DuckDBExport] 📝 STEP 2: Upload path prepared:', tablePath);
      
      // Step 3: Create Supabase client
      console.log('[DuckDBExport] 🔌 STEP 3: Creating Supabase client...');
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });
      console.log('[DuckDBExport] ✅ Supabase client created');
      
      // Step 4: Check auth session
      console.log('[DuckDBExport] 🔐 STEP 4: Checking auth session...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('[DuckDBExport] Auth session check:', {
        hasSession: !!session,
        sessionError: sessionError?.message || null,
        userId: session?.user?.id || 'NO USER',
        role: session?.user?.role || 'NO ROLE'
      });
      
      // Step 5: Upload to storage
      console.log('[DuckDBExport] ⬆️ STEP 5: Uploading to storage bucket "duckdb-tables"...');
      const { data, error } = await supabase.storage
        .from('duckdb-tables')
        .upload(tablePath, tableBlob, {
          contentType: 'application/json',
          upsert: true,
          cacheControl: '3600'
        });
      
      if (error) {
        console.error('[DuckDBExport] ❌ UPLOAD FAILED:', {
          errorMessage: error.message,
          errorName: error.name,
          statusCode: error.statusCode || 'NO_STATUS',
          hint: error.hint || 'NO_HINT',
          details: JSON.stringify(error, null, 2)
        });
        
        // Provide specific error diagnostics
        if (error.message?.includes('row-level security')) {
          console.error('[DuckDBExport] 🔒 DIAGNOSIS: RLS policy blocking upload - user not authenticated properly');
        } else if (error.message?.includes('Bucket not found')) {
          console.error('[DuckDBExport] 🪣 DIAGNOSIS: Storage bucket "duckdb-tables" does not exist');
        } else if (error.message?.includes('Invalid JWT')) {
          console.error('[DuckDBExport] 🔑 DIAGNOSIS: Invalid or expired authentication token');
        } else if (error.statusCode === 403) {
          console.error('[DuckDBExport] 🚫 DIAGNOSIS: Permission denied - check RLS policies');
        }
        
        return null;
      }
      
      console.log('[DuckDBExport] ✅ STEP 5 SUCCESS: Upload complete:', {
        uploadedPath: data?.path,
        id: data?.id
      });
      
      // Step 6: Get public URL
      console.log('[DuckDBExport] 🔗 STEP 6: Getting public URL...');
      const { data: urlData } = supabase.storage
        .from('duckdb-tables')
        .getPublicUrl(tablePath);
      
      const publicUrl = urlData?.publicUrl;
      console.log('[DuckDBExport] ✅ FINAL SUCCESS:', {
        publicUrl,
        fullPath: tablePath
      });
      
      return publicUrl;
    } catch (error) {
      console.error('[DuckDBExport] ❌ EXCEPTION in exportAndUploadToStorage:', {
        errorType: error?.constructor?.name,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        fullError: JSON.stringify(error, null, 2)
      });
      return null;
    }
  }
}