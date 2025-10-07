import { json, unstable_parseMultipartFormData, type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { FileProcessingService } from '~/services/file-processing.server';
import { FileStorageService } from '~/services/storage/file-storage.server';
import { DuckDBSerializationService } from '~/services/duckdb/duckdb-serialization.server';
import { prisma } from '~/utils/db.server';
import { z } from 'zod';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Upload handler to process file buffer
async function uploadHandler({ 
  data, 
  filename, 
  contentType 
}: {
  data: AsyncIterable<Uint8Array>;
  filename?: string;
  contentType: string;
}): Promise<File | null> {
  if (!filename) return null;
  
  // Collect the file data
  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  
  for await (const chunk of data) {
    totalSize += chunk.length;
    if (totalSize > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds 50MB limit`);
    }
    chunks.push(chunk);
  }
  
  // Combine chunks into a single buffer
  const buffer = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  
  // Create a File object
  return new File([buffer], filename, { type: contentType });
}

// Detect potential relationships between tables
function detectRelationships(
  newSchema: any,
  existingTables: Array<{ tableName: string; schema: any }>
): Array<{ fromTable: string; toTable: string; fromColumn: string; toColumn: string; confidence: number }> {
  const relationships: Array<{ fromTable: string; toTable: string; fromColumn: string; toColumn: string; confidence: number }> = [];
  
  if (!newSchema.columns || existingTables.length === 0) return relationships;
  
  // Common patterns for ID fields
  const idPatterns = [/_id$/, /Id$/, /_key$/, /Key$/, /_ref$/, /Ref$/];
  
  newSchema.columns.forEach((column: any) => {
    const columnName = column.name.toLowerCase();
    
    // Check if column name matches ID patterns
    const isLikelyForeignKey = idPatterns.some(pattern => pattern.test(column.name));
    
    if (isLikelyForeignKey) {
      // Try to find matching table
      existingTables.forEach(existingTable => {
        const tableName = existingTable.tableName.toLowerCase();
        const baseColumnName = columnName.replace(/_id$|id$|_key$|key$|_ref$|ref$/i, '');
        
        // High confidence if table name matches column prefix
        if (tableName === baseColumnName || tableName === baseColumnName + 's') {
          relationships.push({
            fromTable: newSchema.tableName,
            toTable: existingTable.tableName,
            fromColumn: column.name,
            toColumn: 'id',
            confidence: 0.9
          });
        }
      });
    }
  });
  
  return relationships;
}

export async function action({ request, response }: ActionFunctionArgs & { response: Response }) {
  console.log(`[Upload] ========== Upload request started ==========`);
  console.log(`[Upload] URL: ${request.url}`);
  console.log(`[Upload] Method: ${request.method}`);
  console.log(`[Upload] Headers:`, {
    'content-type': request.headers.get('content-type'),
    'content-length': request.headers.get('content-length')
  });
  
  try {
    const user = await requireUser(request);
    console.log(`[Upload] User authenticated: ${user.id}`);
    
    // Get pageId and workspaceId from form data or URL params
    const url = new URL(request.url);
    const pageId = url.searchParams.get('pageId');
    const workspaceId = url.searchParams.get('workspaceId');
    const storageUrl = url.searchParams.get('storageUrl');
    
    console.log(`[Upload] Parameters:`, { pageId, workspaceId, storageUrl });
    
    if (!pageId || !workspaceId) {
      console.error(`[Upload] Missing required parameters`);
      return json(
        { error: 'Missing pageId or workspaceId' },
        { status: 400 }
      );
    }
    
    // Verify user has access to the workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        userWorkspaces: {
          some: {
            userId: user.id
          }
        }
      }
    });
    
    if (!workspace) {
      return json(
        { error: 'Workspace not found or access denied' },
        { status: 403 }
      );
    }
    
    // Initialize storage service
    const storageService = new FileStorageService(request, response);
    
    // Parse multipart form data
    console.log(`[Upload] Parsing multipart form data...`);
    const formData = await unstable_parseMultipartFormData(
      request,
      uploadHandler
    );
    console.log(`[Upload] Form data parsed successfully`);
    
    // Handle multiple files
    const files = formData.getAll('files') as File[];
    const singleFile = formData.get('file') as File | null;
    
    const filesToProcess = files.length > 0 ? files : (singleFile ? [singleFile] : []);
    
    console.log(`[Upload] Files to process: ${filesToProcess.length}`);
    filesToProcess.forEach((file, idx) => {
      console.log(`[Upload]   File ${idx + 1}: ${file.name} (${file.size} bytes, ${file.type})`);
    });
    
    if (filesToProcess.length === 0) {
      console.error(`[Upload] No files found in request`);
      return json(
        { error: 'No files uploaded' },
        { status: 400 }
      );
    }
    
    // Get existing tables for relationship detection
    const existingDataFiles = await prisma.dataFile.findMany({
      where: {
        pageId,
        workspaceId
      },
      select: {
        tableName: true,
        schema: true
      }
    });
    
    const processedFiles = [];
    const allRelationships = [];
    
    // Process each file
    for (const file of filesToProcess) {
      try {
        console.log(`[Upload] Processing file: ${file.name}`);
        
        let storageUrl = null;
        let parquetUrl = null;

        // 1. Upload original file to Supabase Storage
        const originalPath = `${workspaceId}/${pageId}/${Date.now()}_${file.name}`;
        const uploadResult = await storageService.uploadFile(
          'user-uploads',
          originalPath,
          file,
          file.type
        );

        storageUrl = await storageService.getSignedUrl('user-uploads', originalPath, 86400); // 24 hours
        console.log(`[Upload] File uploaded to storage: ${originalPath}`);
        
        // 2. Process the file (parse CSV/Excel)
        console.log(`[Upload] Processing file with FileProcessingService...`);
        const processedData = await FileProcessingService.processFile(file);
        console.log(`[Upload] File processed:`);
        console.log(`[Upload] - Table name: ${processedData.tableName}`);
        console.log(`[Upload] - Data rows: ${processedData.data?.length || 0}`);
        console.log(`[Upload] - Schema columns: ${processedData.schema?.columns?.length || 0}`);
        
        // 3. Store data as JSON for easy retrieval
        if (processedData.data && processedData.data.length > 0) {
          try {
            const csvContentData = {
              tableName: processedData.tableName,
              data: processedData.data,
              schema: processedData.schema,
              type: file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'excel',
              timestamp: new Date().toISOString()
            };

            // Save to duckdb-tables bucket as JSON for persistence
            const csvContentPath = `${workspaceId}/${pageId}/${processedData.tableName}_data.json`;
            const jsonBuffer = Buffer.from(JSON.stringify(csvContentData));

            await storageService.uploadFile(
              'duckdb-tables',
              csvContentPath,
              jsonBuffer,
              'application/json'
            );

            parquetUrl = await storageService.getSignedUrl('duckdb-tables', csvContentPath, 86400); // 24 hours
            console.log(`[Upload] CSV/Excel data saved to storage: ${csvContentPath}`);

            // Also create Parquet for DuckDB compatibility
            try {
              const serializationService = new DuckDBSerializationService();
              const result = await serializationService.serializeToParquet(
                processedData.data,
                processedData.schema,
                processedData.tableName
              );
              await serializationService.close();

              // Use updated schema with renamed columns
              processedData.schema = result.schema;

              const parquetPath = `${workspaceId}/${pageId}/${processedData.tableName}.parquet`;
              await storageService.uploadFile(
                'duckdb-tables',
                parquetPath,
                result.buffer,
                'application/octet-stream'
              );
              console.log(`[Upload] Parquet also saved: ${parquetPath}`);
            } catch (parquetError) {
              console.warn(`[Upload] Could not create Parquet:`, parquetError);
            }
          } catch (error) {
            console.error(`[Upload] Could not save CSV/Excel data:`, error);
            // Continue without persistence
          }
        }
        
        // 5. Detect relationships with existing tables
        const relationships = detectRelationships(
          { ...processedData.schema, tableName: processedData.tableName },
          existingDataFiles.map(df => ({
            tableName: df.tableName,
            schema: df.schema
          }))
        );
        
        allRelationships.push(...relationships);
        
        // 6. Store metadata in database
        const dataFile = await prisma.dataFile.create({
          data: {
            pageId,
            workspaceId,
            filename: file.name,
            tableName: processedData.tableName,
            schema: processedData.schema,
            rowCount: processedData.schema.rowCount,
            sizeBytes: file.size,
            storageUrl,
            parquetUrl
          }
        });
        
        processedFiles.push({
          id: dataFile.id,
          filename: file.name,
          tableName: processedData.tableName,
          schema: processedData.schema,
          rowCount: processedData.schema.rowCount,
          sizeBytes: file.size,
          storageUrl,
          parquetUrl,
          data: processedData.data // Return all data for client-side DuckDB
        });
        
        // Update existing tables for next iteration
        existingDataFiles.push({
          tableName: processedData.tableName,
          schema: processedData.schema
        });
        
      } catch (error) {
        console.error(`[Upload] Error processing file ${file.name}:`, error);
        processedFiles.push({
          filename: file.name,
          error: error instanceof Error ? error.message : 'Failed to process file'
        });
      }
    }
    
    return json({
      success: true,
      files: processedFiles,
      relationships: allRelationships,
      message: `Successfully processed ${processedFiles.filter(f => !f.error).length} of ${filesToProcess.length} files`
    });
    
  } catch (error) {
    console.error('[Upload] Error in upload handler:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Failed to process upload' },
      { status: 500 }
    );
  }
}