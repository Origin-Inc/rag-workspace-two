/**
 * Progressive File Upload API Endpoint
 * Task #80.3: Create progressive loading API endpoint
 *
 * ALL files are uploaded directly to Supabase Storage first (bypasses Vercel 4.5MB limit)
 * This endpoint receives only metadata (storageUrl, filename, size) and downloads the file
 * from Supabase (server-to-server, no body size limit)
 *
 * File size determines processing strategy:
 * - < 2MB: Parse entire file at once (mode=metadata returns complete data)
 * - > 2MB: Parse in chunks (mode=stream returns SSE with chunks)
 *
 * Streams file data in chunks to prevent memory issues with large files.
 * Uses Server-Sent Events (SSE) for real-time progress updates.
 */

import { type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { FileUploadService } from '~/services/shared/file-upload.server';
import { FileProcessingService } from '~/services/file-processing.server';
import { FileStorageService } from '~/services/file-storage.server';
import { prisma } from '~/utils/db.server';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (for validation)

/**
 * Download file from Supabase Storage using service role key
 * Used for direct upload flow where file is already in Supabase
 * Bypasses RLS by using service role authentication
 */
async function downloadFileFromSupabaseStorage(
  bucket: string,
  path: string,
  filename: string,
  mimeType: string
): Promise<File> {
  console.log(`[Download] Fetching file from Supabase Storage:`, { bucket, path });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase credentials');
  }

  // Construct storage download URL for private bucket
  // NEW Supabase API keys (sb_secret_...) are NOT JWT tokens
  // They go in the apikey header, NOT the Authorization header
  // Service role bypasses RLS for full access to private buckets
  const downloadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`;

  console.log(`[Download] Downloading from:`, downloadUrl);
  console.log(`[Download] Using service role key format:`, supabaseServiceKey.substring(0, 15) + '...');

  const response = await fetch(downloadUrl, {
    headers: {
      'apikey': supabaseServiceKey
      // Note: No Authorization header - new secret keys are NOT JWT tokens
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Download] Failed to download:`, response.status, errorText);
    throw new Error(`Failed to download file from Supabase: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  console.log(`[Download] Downloaded ${buffer.length} bytes`);

  // Create a File object from the buffer
  return new File([buffer], filename, { type: mimeType });
}

/**
 * Progressive upload endpoint
 * Receives metadata (storagePath, storageBucket, filename, size) and downloads file from Supabase
 *
 * Uses service role key to download from private bucket (bypasses RLS)
 *
 * Modes:
 * - metadata: Download file, process, return metadata
 * - stream: Download file, process in chunks, stream via SSE
 */
export async function action({ request, response }: ActionFunctionArgs & { response: Response }) {
  console.log(`[Progressive Upload] Request started`);

  try {
    const user = await requireUser(request);

    // Get parameters from URL
    const url = new URL(request.url);
    const pageId = url.searchParams.get('pageId');
    const workspaceId = url.searchParams.get('workspaceId');
    const mode = url.searchParams.get('mode') || 'metadata'; // 'metadata' or 'stream'

    console.log(`[Progressive Upload] Parameters:`, { pageId, workspaceId, mode });

    if (!pageId || !workspaceId) {
      return new Response(
        JSON.stringify({ error: 'Missing pageId or workspaceId' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
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
      return new Response(
        JSON.stringify({ error: 'Workspace not found or access denied' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Parse JSON body to get Supabase storage path
    // ALL uploads now go through Supabase first
    console.log('[Progressive Upload] Parsing JSON body for storage path');
    const body = await request.json();
    const { storagePath, storageBucket, filename, fileSize, mimeType } = body;

    if (!storagePath || !storageBucket || !filename) {
      return new Response(
        JSON.stringify({ error: 'Missing storagePath, storageBucket, or filename in request body' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('[Progressive Upload] Downloading file from Supabase:', {
      bucket: storageBucket,
      path: storagePath,
      filename,
      size: fileSize
    });

    // Download file from Supabase using service role (server-to-server, bypasses RLS, no body size limit)
    const file = await downloadFileFromSupabaseStorage(storageBucket, storagePath, filename, mimeType || 'application/octet-stream');

    console.log('[Progressive Upload] File downloaded successfully:', {
      filename: file.name,
      size: file.size,
      type: file.type
    });

    console.log(`[Progressive Upload] Processing: ${file.name}`);
    console.log(`[Progressive Upload] File size: ${file.size} bytes (${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
    console.log(`[Progressive Upload] Mode: ${mode}`);

    // Stream mode ALWAYS uses progressive loading (that's what streaming is for)
    // Metadata mode can optimize for small files
    const result = await FileUploadService.uploadProgressive(file, {
      pageId,
      workspaceId,
      userId: user.id,
      request,
      response
    });

    console.log(`[Progressive Upload] Progressive upload result:`, {
      success: result.success,
      rowCount: result.dataFile?.rowCount,
      estimatedChunks: result.dataFile?.estimatedChunks,
      tableName: result.dataFile?.tableName
    });

    if (!result.success || !result.dataFile) {
      return new Response(JSON.stringify(result), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Mode 1: Return metadata only (client will request chunks separately)
    if (mode === 'metadata') {
      return new Response(
        JSON.stringify({
          success: true,
          dataFile: {
            id: result.dataFile.id,
            filename: result.dataFile.filename,
            tableName: result.dataFile.tableName,
            schema: result.dataFile.schema,
            rowCount: result.dataFile.rowCount,
            sizeBytes: result.dataFile.sizeBytes,
            storageUrl: result.dataFile.storageUrl,
            parquetUrl: result.dataFile.parquetUrl,
            estimatedChunks: result.dataFile.estimatedChunks,
            // Don't include dataStream in JSON response
            progressive: true
          }
        }),
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Mode 2: Stream chunks via Server-Sent Events
    if (mode === 'stream') {
      // Create readable stream for SSE
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const encoder = new TextEncoder();

            // Send initial metadata event
            const metadataEvent = `event: metadata\ndata: ${JSON.stringify({
              id: result.dataFile!.id,
              filename: result.dataFile!.filename,
              tableName: result.dataFile!.tableName,
              schema: result.dataFile!.schema,
              rowCount: result.dataFile!.rowCount,
              estimatedChunks: result.dataFile!.estimatedChunks
            })}\n\n`;
            controller.enqueue(encoder.encode(metadataEvent));

            // Stream data chunks and collect them for persistence
            let chunkIndex = 0;
            let totalRowsStreamed = 0;
            const allChunks: any[] = []; // Collect all chunks for later persistence

            for await (const chunk of result.dataFile!.dataStream) {
              const chunkEvent = `event: chunk\ndata: ${JSON.stringify({
                chunkIndex,
                rowCount: chunk.length,
                data: chunk,
                totalRowsStreamed: totalRowsStreamed + chunk.length,
                totalRows: result.dataFile!.rowCount
              })}\n\n`;

              controller.enqueue(encoder.encode(chunkEvent));

              // Collect chunk for persistence
              allChunks.push(...chunk);

              totalRowsStreamed += chunk.length;
              chunkIndex++;

              console.log(`[Progressive Upload] Streamed chunk ${chunkIndex} (${chunk.length} rows)`);
            }

            // After streaming completes, persist data to Supabase Storage for re-loading
            try {
              console.log(`[Progressive Upload] Persisting ${allChunks.length} rows to storage for re-loading`);

              const storageService = new FileStorageService(request, response);

              // Create JSON file with all data
              const jsonData = {
                data: allChunks,
                schema: result.dataFile!.schema
              };
              const jsonBuffer = Buffer.from(JSON.stringify(jsonData));
              const jsonPath = `${workspaceId}/${pageId}/${result.dataFile!.tableName}.json`;

              await storageService.uploadFile(
                'duckdb-tables',
                jsonPath,
                jsonBuffer,
                'application/json'
              );

              const parquetUrl = await storageService.getSignedUrl('duckdb-tables', jsonPath, 86400);

              // Update dataFile with parquetUrl so it can be reloaded after refresh
              await prisma.dataFile.update({
                where: { id: result.dataFile!.id },
                data: { parquetUrl }
              });

              console.log(`[Progressive Upload] ✅ Data persisted with parquetUrl for future reloading`);
            } catch (persistError) {
              console.error(`[Progressive Upload] ⚠️ Failed to persist data (non-fatal):`, persistError);
              // Continue - streaming already succeeded, persistence is for future reloads
            }

            // Send completion event
            const completeEvent = `event: complete\ndata: ${JSON.stringify({
              totalChunks: chunkIndex,
              totalRows: totalRowsStreamed
            })}\n\n`;
            controller.enqueue(encoder.encode(completeEvent));

            console.log(`[Progressive Upload] Stream complete: ${chunkIndex} chunks, ${totalRowsStreamed} rows`);
            controller.close();
          } catch (error) {
            console.error('[Progressive Upload] Stream error:', error);
            const errorEvent = `event: error\ndata: ${JSON.stringify({
              error: error instanceof Error ? error.message : 'Stream failed'
            })}\n\n`;
            controller.enqueue(new TextEncoder().encode(errorEvent));
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }

    // Default: return error
    return new Response(
      JSON.stringify({ error: 'Invalid mode. Use metadata or stream' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[Progressive Upload] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to process upload'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
