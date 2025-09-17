import type { ActionFunction } from '@remix-run/node';
import { json, unstable_parseMultipartFormData } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { FileUploadService } from '~/services/file-upload.server';
import { FileProcessingService } from '~/services/file-processing.server';
import { prisma } from '~/utils/prisma.server';
import { z } from 'zod';

// Custom upload handler for processing file uploads
const uploadHandler = async ({
  name,
  data,
  filename,
  contentType
}: {
  name: string;
  data: AsyncIterable<Uint8Array>;
  filename?: string;
  contentType?: string;
}) => {
  if (name !== 'file' || !filename) {
    return undefined;
  }

  // Collect file data into buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of data) {
    chunks.push(chunk);
  }
  
  const buffer = Buffer.concat(chunks);
  
  return {
    buffer,
    filename,
    contentType: contentType || 'application/octet-stream'
  };
};

// Schema for request validation
const uploadSchema = z.object({
  workspaceId: z.string().uuid(),
  pageId: z.string().uuid().optional(),
  isShared: z.boolean().optional(),
  processImmediately: z.boolean().optional()
});

export const action: ActionFunction = async ({ request }) => {
  try {
    // Require authenticated user
    const user = await requireUser(request);

    // Check if this is a request for signed URL (for large files)
    if (request.headers.get('X-Upload-Mode') === 'signed-url') {
      const formData = await request.formData();
      const workspaceId = formData.get('workspaceId') as string;
      const filename = formData.get('filename') as string;
      const isShared = formData.get('isShared') === 'true';

      if (!workspaceId || !filename) {
        return json(
          { error: 'Missing required fields' },
          { status: 400 }
        );
      }

      // Get workspace
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: workspaceId,
          userWorkspaces: {
            some: {
              userId: user.id,
              status: 'active'
            }
          }
        }
      });

      if (!workspace) {
        return json(
          { error: 'Workspace not found' },
          { status: 404 }
        );
      }

      // Generate signed upload URL
      const { uploadUrl, storagePath } = await FileUploadService.generateUploadUrl(
        user,
        workspace,
        filename,
        isShared
      );

      return json({
        uploadUrl,
        storagePath,
        mode: 'direct-upload'
      });
    }

    // Parse multipart form data for direct uploads
    const formData = await unstable_parseMultipartFormData(request, uploadHandler);
    
    // Get file from form data
    const file = formData.get('file') as {
      buffer: Buffer;
      filename: string;
      contentType: string;
    } | null;

    if (!file) {
      return json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Get other form fields
    const workspaceId = formData.get('workspaceId') as string;
    const pageId = formData.get('pageId') as string | undefined;
    const isShared = formData.get('isShared') === 'true';
    const processImmediately = formData.get('processImmediately') === 'true';

    // Validate fields
    const validation = uploadSchema.safeParse({
      workspaceId,
      pageId,
      isShared,
      processImmediately
    });

    if (!validation.success) {
      return json(
        { error: 'Invalid request data', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Get workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        userWorkspaces: {
          some: {
            userId: user.id,
            status: 'active'
          }
        }
      }
    });

    if (!workspace) {
      return json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Check file size limit (10MB for direct upload, larger files should use signed URLs)
    const MAX_DIRECT_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.buffer.length > MAX_DIRECT_UPLOAD_SIZE) {
      return json(
        { 
          error: 'File too large for direct upload', 
          suggestion: 'Use signed URL upload for files larger than 10MB' 
        },
        { status: 413 }
      );
    }

    // Upload file to Supabase Storage
    const uploadResult = await FileUploadService.uploadFile({
      user,
      workspace,
      pageId,
      file: file.buffer,
      filename: file.filename,
      mimeType: file.contentType,
      isShared
    });

    // If processImmediately is true, create a processing job
    if (processImmediately) {
      const jobType = file.contentType.includes('pdf') 
        ? 'extract_pdf' 
        : file.contentType.includes('excel') || file.filename.endsWith('.xlsx')
        ? 'parse_excel'
        : 'parse_csv';

      await prisma.fileProcessingJob.create({
        data: {
          fileId: uploadResult.fileId,
          workspaceId: workspace.id,
          jobType,
          status: 'pending',
          priority: 5
        }
      });

      // Update file status to processing
      await FileUploadService.updateProcessingStatus(
        uploadResult.fileId,
        'processing'
      );
    }

    return json({
      success: true,
      fileId: uploadResult.fileId,
      storagePath: uploadResult.storagePath,
      signedUrl: uploadResult.signedUrl,
      checksum: uploadResult.checksum,
      message: processImmediately 
        ? 'File uploaded and queued for processing' 
        : 'File uploaded successfully'
    });

  } catch (error) {
    console.error('Upload error:', error);
    return json(
      { 
        error: 'Upload failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
};

// GET endpoint to check upload status
export const loader = async ({ request }: { request: Request }) => {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const fileId = url.searchParams.get('fileId');

  if (!fileId) {
    return json({ error: 'File ID required' }, { status: 400 });
  }

  const file = await prisma.userFile.findFirst({
    where: {
      id: fileId,
      OR: [
        { userId: user.id },
        {
          workspace: {
            userWorkspaces: {
              some: {
                userId: user.id,
                status: 'active'
              }
            }
          }
        }
      ]
    },
    include: {
      dataTable: {
        select: {
          id: true,
          tableName: true,
          rowCount: true
        }
      },
      processingJobs: {
        where: {
          status: { in: ['pending', 'running'] }
        },
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });

  if (!file) {
    return json({ error: 'File not found' }, { status: 404 });
  }

  const currentJob = file.processingJobs[0];

  return json({
    fileId: file.id,
    filename: file.originalName,
    processingStatus: file.processingStatus,
    processingError: file.processingError,
    dataTable: file.dataTable,
    currentJob: currentJob ? {
      id: currentJob.id,
      status: currentJob.status,
      progressPercent: currentJob.progressPercent,
      processedRows: currentJob.processedRows,
      totalRows: currentJob.totalRows
    } : null
  });
};