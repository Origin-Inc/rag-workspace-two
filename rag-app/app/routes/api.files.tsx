import type { ActionFunction, LoaderFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { FileUploadService } from '~/services/file-upload.server';
import { prisma } from '~/utils/db.server';
import { z } from 'zod';

// Schema for query parameters
const listSchema = z.object({
  workspaceId: z.string().uuid(),
  pageId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  includeShared: z.coerce.boolean().default(true)
});

// Schema for delete action
const deleteSchema = z.object({
  fileId: z.string().uuid()
});

// Schema for share action  
const shareSchema = z.object({
  fileId: z.string().uuid(),
  shareScope: z.enum(['workspace', 'public', 'none']),
  permissions: z.array(z.string()).optional()
});

/**
 * GET /api/files - List user files
 */
export const loader: LoaderFunction = async ({ request }) => {
  try {
    const user = await requireUser(request);
    const url = new URL(request.url);
    
    // Parse query parameters
    const params = {
      workspaceId: url.searchParams.get('workspaceId'),
      pageId: url.searchParams.get('pageId') || undefined,
      limit: url.searchParams.get('limit') || '20',
      offset: url.searchParams.get('offset') || '0',
      includeShared: url.searchParams.get('includeShared') || 'true'
    };

    const validation = listSchema.safeParse(params);
    if (!validation.success) {
      return json(
        { error: 'Invalid parameters', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, pageId, limit, offset, includeShared } = validation.data;

    // Verify user has access to workspace
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
      return json({ error: 'Workspace not found' }, { status: 404 });
    }

    // List files
    const result = await FileUploadService.listFiles(
      user.id,
      workspaceId,
      {
        pageId,
        limit,
        offset,
        includeShared
      }
    );

    // Add signed URLs for file access
    const filesWithUrls = await Promise.all(
      result.files.map(async (file) => {
        // Generate a signed URL valid for 1 hour
        const { data: signedData } = await supabase.storage
          .from(FileUploadService.BUCKET_NAME)
          .createSignedUrl(file.storagePath, 3600);

        return {
          ...file,
          signedUrl: signedData?.signedUrl,
          // Convert BigInt to string for JSON serialization
          sizeBytes: file.sizeBytes.toString()
        };
      })
    );

    return json({
      files: filesWithUrls,
      total: result.total,
      hasMore: result.hasMore,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error listing files:', error);
    return json(
      { error: 'Failed to list files' },
      { status: 500 }
    );
  }
};

/**
 * POST /api/files - File actions (delete, share, etc.)
 */
export const action: ActionFunction = async ({ request }) => {
  try {
    const user = await requireUser(request);
    const formData = await request.formData();
    const action = formData.get('action') as string;

    if (!action) {
      return json({ error: 'Action required' }, { status: 400 });
    }

    switch (action) {
      case 'delete': {
        const fileId = formData.get('fileId') as string;
        
        const validation = deleteSchema.safeParse({ fileId });
        if (!validation.success) {
          return json(
            { error: 'Invalid parameters', details: validation.error.flatten() },
            { status: 400 }
          );
        }

        // Delete file
        await FileUploadService.deleteFile(fileId, user.id);

        return json({ success: true, message: 'File deleted successfully' });
      }

      case 'share': {
        const fileId = formData.get('fileId') as string;
        const shareScope = formData.get('shareScope') as string;
        const permissions = formData.get('permissions')?.toString().split(',') || [];

        const validation = shareSchema.safeParse({
          fileId,
          shareScope,
          permissions
        });

        if (!validation.success) {
          return json(
            { error: 'Invalid parameters', details: validation.error.flatten() },
            { status: 400 }
          );
        }

        // Update file sharing settings
        const file = await prisma.userFile.findFirst({
          where: {
            id: fileId,
            userId: user.id
          }
        });

        if (!file) {
          return json({ error: 'File not found' }, { status: 404 });
        }

        const updatedFile = await prisma.userFile.update({
          where: { id: fileId },
          data: {
            isShared: shareScope !== 'none',
            shareScope: shareScope === 'none' ? null : shareScope,
            metadata: {
              ...((file.metadata as any) || {}),
              permissions: shareScope !== 'none' ? permissions : []
            }
          }
        });

        // Generate new signed URL if file is shared
        let signedUrl: string | undefined;
        if (shareScope !== 'none') {
          const { data: signedData } = await supabase.storage
            .from(FileUploadService.BUCKET_NAME)
            .createSignedUrl(file.storagePath, 7 * 24 * 60 * 60); // 7 days

          signedUrl = signedData?.signedUrl;

          // Update storage URL in database
          await prisma.userFile.update({
            where: { id: fileId },
            data: { storageUrl: signedUrl }
          });
        }

        return json({
          success: true,
          message: `File ${shareScope === 'none' ? 'unshared' : 'shared'} successfully`,
          signedUrl
        });
      }

      case 'download': {
        const fileId = formData.get('fileId') as string;

        if (!fileId) {
          return json({ error: 'File ID required' }, { status: 400 });
        }

        // Get file and verify access
        const file = await prisma.userFile.findFirst({
          where: {
            id: fileId,
            OR: [
              { userId: user.id },
              {
                isShared: true,
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
          }
        });

        if (!file) {
          return json({ error: 'File not found' }, { status: 404 });
        }

        // Generate download URL
        const { data: signedData } = await supabase.storage
          .from(FileUploadService.BUCKET_NAME)
          .createSignedUrl(file.storagePath, 300); // 5 minutes

        if (!signedData) {
          return json({ error: 'Failed to generate download URL' }, { status: 500 });
        }

        // Update last accessed time
        await prisma.userFile.update({
          where: { id: fileId },
          data: { lastAccessedAt: new Date() }
        });

        return json({
          success: true,
          downloadUrl: signedData.signedUrl,
          filename: file.originalName,
          mimeType: file.mimeType
        });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('File action error:', error);
    return json(
      { error: 'Action failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
};

// Import supabase client
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});