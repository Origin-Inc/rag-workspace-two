/**
 * Progressive File Upload API Endpoint
 * Task #80.3: Create progressive loading API endpoint
 *
 * Streams file data in chunks to prevent memory issues with large files.
 * Uses Server-Sent Events (SSE) for real-time progress updates.
 */

import { unstable_parseMultipartFormData, type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { FileUploadService } from '~/services/shared/file-upload.server';
import { prisma } from '~/utils/db.server';

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

/**
 * Progressive upload endpoint
 * Returns metadata immediately, then streams data chunks
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

    // Parse multipart form data
    const formData = await unstable_parseMultipartFormData(request, uploadHandler);

    const files = formData.getAll('files') as File[];
    const singleFile = formData.get('file') as File | null;

    const filesToProcess = files.length > 0 ? files : singleFile ? [singleFile] : [];

    if (filesToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No files uploaded' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // For now, handle single file (can extend to multiple later)
    const file = filesToProcess[0];

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

            // Stream data chunks
            let chunkIndex = 0;
            let totalRowsStreamed = 0;

            for await (const chunk of result.dataFile!.dataStream) {
              const chunkEvent = `event: chunk\ndata: ${JSON.stringify({
                chunkIndex,
                rowCount: chunk.length,
                data: chunk,
                totalRowsStreamed: totalRowsStreamed + chunk.length,
                totalRows: result.dataFile!.rowCount
              })}\n\n`;

              controller.enqueue(encoder.encode(chunkEvent));

              totalRowsStreamed += chunk.length;
              chunkIndex++;

              console.log(`[Progressive Upload] Streamed chunk ${chunkIndex} (${chunk.length} rows)`);
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
