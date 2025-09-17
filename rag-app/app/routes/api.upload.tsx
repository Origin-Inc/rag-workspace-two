import type { ActionFunction, LoaderFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { FileUploadService } from '~/services/file-upload.server';
import { prisma } from '~/utils/db.server';
import { z } from 'zod';

/**
 * Production-ready file upload API that works on Vercel
 * Uses direct browser-to-Supabase uploads to bypass serverless limitations
 * 
 * Flow:
 * 1. Client requests signed URL (POST with metadata)
 * 2. Client uploads directly to Supabase Storage
 * 3. Client confirms upload completion (POST with confirmation)
 */

// Schema for signed URL request
const signedUrlSchema = z.object({
  workspaceId: z.string().uuid(),
  pageId: z.string().uuid().optional().nullable(),
  filename: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string(),
  isShared: z.boolean().optional(),
});

// Schema for upload confirmation
const confirmUploadSchema = z.object({
  fileId: z.string().uuid(),
  storagePath: z.string(),
  processImmediately: z.boolean().optional(),
});

export const action: ActionFunction = async ({ request }) => {
  try {
    const user = await requireUser(request);
    const contentType = request.headers.get('Content-Type');
    
    // Parse JSON body (no multipart!)
    const body = await request.json();
    const action = body.action;

    if (action === 'request-upload-url') {
      // Step 1: Generate signed URL for direct upload
      const validation = signedUrlSchema.safeParse(body);
      
      if (!validation.success) {
        return json(
          { error: 'Invalid request', details: validation.error.flatten() },
          { status: 400 }
        );
      }

      const { workspaceId, pageId, filename, fileSize, mimeType, isShared } = validation.data;

      // Verify workspace access
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
        return json({ error: 'Workspace not found' }, { status: 404 });
      }

      // Check file size limit (500MB max for Supabase)
      const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
      if (fileSize > MAX_FILE_SIZE) {
        return json(
          { error: 'File too large', maxSize: MAX_FILE_SIZE },
          { status: 413 }
        );
      }

      // Create file record in database first
      const fileRecord = await prisma.userFile.create({
        data: {
          userId: user.id,
          workspaceId,
          pageId: pageId || undefined,
          originalName: filename,
          mimeType,
          sizeBytes: fileSize,
          storagePath: '', // Will be updated after upload
          isShared: isShared || false,
          processingStatus: 'pending',
          uploadStatus: 'pending',
        }
      });

      // Generate signed URL for direct upload
      const { uploadUrl, storagePath, token } = await FileUploadService.generateUploadUrl(
        user,
        workspace,
        filename,
        isShared || false
      );

      // Update file record with storage path
      await prisma.userFile.update({
        where: { id: fileRecord.id },
        data: { storagePath }
      });

      return json({
        success: true,
        fileId: fileRecord.id,
        uploadUrl,
        storagePath,
        token, // Include token in case client needs it
        expiresIn: 300, // URL expires in 5 minutes
      });

    } else if (action === 'confirm-upload') {
      // Step 2: Confirm successful upload and trigger processing
      const validation = confirmUploadSchema.safeParse(body);
      
      if (!validation.success) {
        return json(
          { error: 'Invalid confirmation', details: validation.error.flatten() },
          { status: 400 }
        );
      }

      const { fileId, storagePath, processImmediately } = validation.data;

      // Verify file record exists and belongs to user
      const file = await prisma.userFile.findFirst({
        where: {
          id: fileId,
          userId: user.id,
          uploadStatus: 'pending'
        },
        include: { workspace: true }
      });

      if (!file) {
        return json({ error: 'File not found or already processed' }, { status: 404 });
      }

      // Verify the file actually exists in storage
      const exists = await FileUploadService.verifyFileExists(storagePath);
      if (!exists) {
        await prisma.userFile.update({
          where: { id: fileId },
          data: {
            uploadStatus: 'failed',
            processingError: 'File not found in storage'
          }
        });
        return json({ error: 'Upload verification failed' }, { status: 400 });
      }

      // Mark upload as complete
      await prisma.userFile.update({
        where: { id: fileId },
        data: {
          uploadStatus: 'completed',
          uploadedAt: new Date()
        }
      });

      // Create processing job if requested
      if (processImmediately) {
        const jobType = file.mimeType.includes('pdf') 
          ? 'extract_pdf' 
          : file.mimeType.includes('excel') || file.originalName.endsWith('.xlsx')
          ? 'parse_excel'
          : 'parse_csv';

        const job = await prisma.fileProcessingJob.create({
          data: {
            fileId,
            workspaceId: file.workspaceId,
            jobType,
            status: 'pending',
            priority: 5
          }
        });

        // Update file processing status
        await prisma.userFile.update({
          where: { id: fileId },
          data: { processingStatus: 'processing' }
        });

        return json({
          success: true,
          fileId,
          jobId: job.id,
          message: 'File uploaded and queued for processing'
        });
      }

      return json({
        success: true,
        fileId,
        message: 'File uploaded successfully'
      });

    } else if (action === 'cancel-upload') {
      // Optional: Clean up cancelled uploads
      const { fileId } = body;
      
      if (!fileId) {
        return json({ error: 'File ID required' }, { status: 400 });
      }

      await prisma.userFile.updateMany({
        where: {
          id: fileId,
          userId: user.id,
          uploadStatus: 'pending'
        },
        data: {
          uploadStatus: 'cancelled',
          processingStatus: 'cancelled'
        }
      });

      return json({ success: true, message: 'Upload cancelled' });
    }

    return json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Upload API error:', error);
    return json(
      { 
        error: 'Upload operation failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
};

// GET endpoint to check upload/processing status
export const loader: LoaderFunction = async ({ request }) => {
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
                userId: user.id
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
    uploadStatus: file.uploadStatus,
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