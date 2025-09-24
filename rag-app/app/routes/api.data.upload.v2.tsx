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
  try {
    const user = await requireUser(request);
    
    // Get pageId and workspaceId from form data or URL params
    const url = new URL(request.url);
    const pageId = url.searchParams.get('pageId');
    const workspaceId = url.searchParams.get('workspaceId');
    
    if (!pageId || !workspaceId) {
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
    const formData = await unstable_parseMultipartFormData(
      request,
      uploadHandler
    );
    
    // Handle multiple files
    const files = formData.getAll('files') as File[];
    const singleFile = formData.get('file') as File | null;
    
    const filesToProcess = files.length > 0 ? files : (singleFile ? [singleFile] : []);
    
    if (filesToProcess.length === 0) {
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
        
        // For PDFs, the file is already uploaded from client - just process it
        // For CSV/Excel, we need to upload and serialize
        if (file.name.toLowerCase().endsWith('.pdf')) {
          // PDF files are already uploaded from client, skip storage upload
          console.log(`[Upload] Processing PDF file: ${file.name}`);
          // We'll process the PDF content directly
          storageUrl = url.searchParams.get('storageUrl') || null;
        } else {
          // 1. Upload original file to Supabase Storage (for CSV/Excel)
          const originalPath = `${workspaceId}/${pageId}/${Date.now()}_${file.name}`;
          const uploadResult = await storageService.uploadFile(
            'user-data-files',
            originalPath,
            file,
            file.type
          );
          
          storageUrl = await storageService.getSignedUrl('user-data-files', originalPath, 86400); // 24 hours
          console.log(`[Upload] File uploaded to storage: ${originalPath}`);
        }
        
        // 2. Process the file (parse CSV/Excel/PDF)
        const processedData = await FileProcessingService.processFile(file);
        
        // 3. Serialize to Parquet (skip for PDFs if no tabular data)
        if (processedData.data && processedData.data.length > 0) {
          try {
            const serializationService = new DuckDBSerializationService();
            const parquetBuffer = await serializationService.serializeToParquet(
              processedData.data,
              processedData.schema,
              processedData.tableName
            );
            await serializationService.close();
            
            console.log(`[Upload] Serialized to Parquet: ${parquetBuffer.length} bytes`);
            
            // 4. Upload Parquet to Supabase Storage (skip if PDF already uploaded)
            if (!file.name.toLowerCase().endsWith('.pdf')) {
              const parquetPath = `${workspaceId}/${pageId}/${processedData.tableName}.parquet`;
              await storageService.uploadFile(
                'duckdb-tables',
                parquetPath,
                parquetBuffer,
                'application/octet-stream'
              );
              
              parquetUrl = await storageService.getSignedUrl('duckdb-tables', parquetPath, 86400); // 24 hours
              console.log(`[Upload] Parquet uploaded to storage: ${parquetPath}`);
            }
          } catch (parquetError) {
            console.warn(`[Upload] Could not serialize to Parquet (might be PDF with no tables):`, parquetError);
            // Continue without parquet for PDFs - they might only have text content
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
            parquetUrl,
            // Store PDF-specific metadata if available
            metadata: processedData.extractedContent ? {
              type: 'pdf',
              totalPages: processedData.extractedContent.metadata?.totalPages,
              tablesFound: processedData.extractedContent.tables?.length || 0,
              imagesFound: processedData.extractedContent.images?.length || 0,
              author: processedData.extractedContent.metadata?.author,
              title: processedData.extractedContent.metadata?.title,
              creationDate: processedData.extractedContent.metadata?.creationDate
            } : undefined
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
          data: processedData.data.slice(0, 10), // Preview data
          // Include PDF metadata if available
          ...(processedData.extractedContent && {
            pdfMetadata: {
              totalPages: processedData.extractedContent.metadata?.totalPages,
              tablesExtracted: processedData.extractedContent.tables?.length || 0,
              imagesExtracted: processedData.extractedContent.images?.length || 0
            }
          })
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