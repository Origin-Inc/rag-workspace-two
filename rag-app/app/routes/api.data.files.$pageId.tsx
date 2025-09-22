import type { LoaderFunction, ActionFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { prisma } from '~/utils/db.server';
import { requireUser } from '~/services/auth/auth.server';
import { DebugLogger } from '~/utils/debug-logger';
import { z } from 'zod';

const logger = new DebugLogger('api.data.files');

// Schema for validating file metadata
const fileMetadataSchema = z.object({
  filename: z.string(),
  tableName: z.string(),
  schema: z.array(z.object({
    name: z.string(),
    type: z.string(),
    sampleData: z.array(z.any()).optional(),
  })),
  rowCount: z.number(),
  sizeBytes: z.number(),
  storageUrl: z.string().nullable().optional(),
  parquetUrl: z.string().nullable().optional(),
});

// GET /api/data/files/:pageId - Fetch data files for a page
export const loader: LoaderFunction = async ({ request, params }) => {
  try {
    const user = await requireUser(request);
    const { pageId } = params;

    if (!pageId) {
      return json({ error: 'Page ID required' }, { status: 400 });
    }

    // Verify user has access to the page
    const page = await prisma.page.findFirst({
      where: {
        id: pageId,
        workspace: {
          userWorkspaces: {
            some: {
              userId: user.id,
            },
          },
        },
      },
    });

    if (!page) {
      return json({ error: 'Page not found or access denied' }, { status: 404 });
    }

    // Fetch data files for the page
    const dataFiles = await prisma.dataFile.findMany({
      where: {
        pageId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        filename: true,
        tableName: true,
        schema: true,
        rowCount: true,
        sizeBytes: true,
        storageUrl: true,
        parquetUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.trace('Fetched data files', { 
      pageId, 
      count: dataFiles.length,
      userId: user.id 
    });

    return json({ files: dataFiles });
  } catch (error: any) {
    logger.error('Failed to fetch data files:', error);
    
    // Provide more detailed error for debugging
    const errorMessage = error?.message || 'Failed to fetch data files';
    const isAuthError = errorMessage.includes('auth') || errorMessage.includes('user') || errorMessage.includes('session');
    
    return json(
      { 
        error: 'Failed to fetch data files',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        type: isAuthError ? 'auth' : 'unknown'
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
};

// POST /api/data/files/:pageId - Save new data file metadata
// DELETE /api/data/files/:pageId - Delete a data file
export const action: ActionFunction = async ({ request, params }) => {
  try {
    const user = await requireUser(request);
    const { pageId } = params;

    if (!pageId) {
      return json({ error: 'Page ID required' }, { status: 400 });
    }

    // Verify user has access to the page
    const page = await prisma.page.findFirst({
      where: {
        id: pageId,
        workspace: {
          userWorkspaces: {
            some: {
              userId: user.id,
            },
          },
        },
      },
      select: {
        id: true,
        workspaceId: true,
      },
    });

    if (!page) {
      return json({ error: 'Page not found or access denied' }, { status: 404 });
    }

    if (request.method === 'POST') {
      // Parse and validate request body
      const body = await request.json();
      const result = fileMetadataSchema.safeParse(body);
      
      if (!result.success) {
        return json(
          { error: 'Invalid file metadata', details: result.error.flatten() },
          { status: 400 }
        );
      }

      // Create data file record
      const dataFile = await prisma.dataFile.create({
        data: {
          pageId: page.id,
          workspaceId: page.workspaceId,
          filename: result.data.filename,
          tableName: result.data.tableName,
          schema: result.data.schema,
          rowCount: result.data.rowCount,
          sizeBytes: result.data.sizeBytes,
          storageUrl: result.data.storageUrl,
          parquetUrl: result.data.parquetUrl,
        },
        select: {
          id: true,
          filename: true,
          tableName: true,
          schema: true,
          rowCount: true,
          sizeBytes: true,
          storageUrl: true,
          parquetUrl: true,
          createdAt: true,
        },
      });

      logger.trace('Created data file record', { 
        fileId: dataFile.id,
        pageId,
        filename: result.data.filename,
        userId: user.id 
      });

      return json({ dataFile });
    }

    if (request.method === 'DELETE') {
      const { fileId } = await request.json();
      
      if (!fileId) {
        return json({ error: 'File ID required' }, { status: 400 });
      }

      // Verify the file belongs to the page
      const dataFile = await prisma.dataFile.findFirst({
        where: {
          id: fileId,
          pageId,
        },
      });

      if (!dataFile) {
        return json({ error: 'File not found' }, { status: 404 });
      }

      // Delete the file record
      await prisma.dataFile.delete({
        where: {
          id: fileId,
        },
      });

      logger.trace('Deleted data file', { 
        fileId,
        pageId,
        userId: user.id 
      });

      return json({ success: true });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    logger.error('Failed to process data file action:', error);
    
    // Provide more detailed error for debugging
    const errorMessage = error?.message || 'Failed to process data file action';
    const isAuthError = errorMessage.includes('auth') || errorMessage.includes('user') || errorMessage.includes('session');
    
    return json(
      { 
        error: 'Failed to process data file action',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        type: isAuthError ? 'auth' : 'unknown'
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
};