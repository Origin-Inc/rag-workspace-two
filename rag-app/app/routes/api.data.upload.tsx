import { json, unstable_parseMultipartFormData, type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { FileProcessingService } from '~/services/file-processing.server';
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
        
        // Check if existing table has matching column values
        existingTable.schema.columns?.forEach((existingCol: any) => {
          if (existingCol.name.toLowerCase() === 'id' && 
              column.type === existingCol.type) {
            // Medium confidence based on type match
            if (!relationships.find(r => 
              r.fromColumn === column.name && 
              r.toTable === existingTable.tableName)) {
              relationships.push({
                fromTable: newSchema.tableName,
                toTable: existingTable.tableName,
                fromColumn: column.name,
                toColumn: existingCol.name,
                confidence: 0.5
              });
            }
          }
        });
      });
    }
  });
  
  return relationships;
}

export async function action({ request }: ActionFunctionArgs) {
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
        // Process the file
        const processedData = await FileProcessingService.processFile(file);
        
        // Detect relationships with existing tables
        const relationships = detectRelationships(
          { ...processedData.schema, tableName: processedData.tableName },
          existingDataFiles.map(df => ({
            tableName: df.tableName,
            schema: df.schema
          }))
        );
        
        allRelationships.push(...relationships);
        
        // Store metadata in database
        const dataFile = await prisma.dataFile.create({
          data: {
            pageId,
            workspaceId,
            filename: file.name,
            tableName: processedData.tableName,
            schema: processedData.schema,
            rowCount: processedData.schema.rowCount,
            sizeBytes: file.size,
          }
        });
        
        processedFiles.push({
          id: dataFile.id,
          filename: dataFile.filename,
          tableName: dataFile.tableName,
          rowCount: dataFile.rowCount,
          sizeBytes: dataFile.sizeBytes,
          schema: processedData.schema,
          sampleData: processedData.schema.sampleData,
          sheets: processedData.sheets
        });
        
        // Add to existing tables for next iteration
        existingDataFiles.push({
          tableName: dataFile.tableName,
          schema: dataFile.schema as any
        });
        
      } catch (fileError) {
        console.error(`Failed to process file ${file.name}:`, fileError);
        processedFiles.push({
          filename: file.name,
          error: fileError instanceof Error ? fileError.message : 'Unknown error'
        });
      }
    }
    
    // Return success response with all processed files and detected relationships
    return json({
      success: true,
      dataFiles: processedFiles,
      relationships: allRelationships.filter(r => r.confidence > 0.5),
      totalFiles: filesToProcess.length,
      successfulUploads: processedFiles.filter(f => !('error' in f)).length
    });
    
  } catch (error) {
    console.error('File upload error:', error);
    
    if (error instanceof Error) {
      return json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    return json(
      { error: 'Failed to process file upload' },
      { status: 500 }
    );
  }
}

// Rate limiting could be added here using Redis
// Example: Check upload count per user in last hour
async function checkRateLimit(userId: string): Promise<boolean> {
  // Implementation would use Redis to track uploads
  // For now, always allow
  return true;
}