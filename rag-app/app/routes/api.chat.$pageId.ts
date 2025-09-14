import { json, type ActionFunction, type LoaderFunction } from '@remix-run/node';
import { prisma } from '~/utils/db.server';
import { requireUser } from '~/services/auth/auth.server';
import { z } from 'zod';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  metadata: z.any().optional(),
});

const dataFileSchema = z.object({
  filename: z.string(),
  tableName: z.string(),
  schema: z.array(z.object({
    name: z.string(),
    type: z.string(),
  })),
  rowCount: z.number(),
  sizeBytes: z.number(),
});

// GET /api/chat/:pageId - Get chat messages for a page
export const loader: LoaderFunction = async ({ request, params }) => {
  const user = await requireUser(request);
  const pageId = params.pageId;

  if (!pageId) {
    return json({ error: 'Page ID required' }, { status: 400 });
  }

  // Verify user has access to this page
  const page = await prisma.page.findFirst({
    where: {
      id: pageId,
      workspace: {
        users: {
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

  // Get messages and data files
  const [messages, dataFiles] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { pageId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.dataFile.findMany({
      where: { pageId },
      orderBy: { uploadedAt: 'desc' },
    }),
  ]);

  return json({ messages, dataFiles });
};

// POST /api/chat/:pageId - Add a new message or data file
export const action: ActionFunction = async ({ request, params }) => {
  const user = await requireUser(request);
  const pageId = params.pageId;

  if (!pageId) {
    return json({ error: 'Page ID required' }, { status: 400 });
  }

  // Verify user has access to this page
  const page = await prisma.page.findFirst({
    where: {
      id: pageId,
      workspace: {
        users: {
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

  const formData = await request.formData();
  const intent = formData.get('intent');

  switch (intent) {
    case 'addMessage': {
      const messageData = messageSchema.safeParse({
        role: formData.get('role'),
        content: formData.get('content'),
        metadata: formData.get('metadata') ? JSON.parse(formData.get('metadata') as string) : undefined,
      });

      if (!messageData.success) {
        return json({ error: messageData.error.flatten() }, { status: 400 });
      }

      const message = await prisma.chatMessage.create({
        data: {
          pageId,
          workspaceId: page.workspaceId,
          userId: user.id,
          ...messageData.data,
        },
      });

      return json({ message });
    }

    case 'addDataFile': {
      const fileData = dataFileSchema.safeParse({
        filename: formData.get('filename'),
        tableName: formData.get('tableName'),
        schema: JSON.parse(formData.get('schema') as string),
        rowCount: parseInt(formData.get('rowCount') as string),
        sizeBytes: parseInt(formData.get('sizeBytes') as string),
      });

      if (!fileData.success) {
        return json({ error: fileData.error.flatten() }, { status: 400 });
      }

      const dataFile = await prisma.dataFile.create({
        data: {
          pageId,
          workspaceId: page.workspaceId,
          userId: user.id,
          ...fileData.data,
        },
      });

      return json({ dataFile });
    }

    case 'deleteMessage': {
      const messageId = formData.get('messageId') as string;
      
      await prisma.chatMessage.delete({
        where: {
          id: messageId,
          pageId,
        },
      });

      return json({ success: true });
    }

    case 'deleteDataFile': {
      const fileId = formData.get('fileId') as string;
      
      await prisma.dataFile.delete({
        where: {
          id: fileId,
          pageId,
        },
      });

      return json({ success: true });
    }

    case 'clearMessages': {
      await prisma.chatMessage.deleteMany({
        where: { pageId },
      });

      return json({ success: true });
    }

    default:
      return json({ error: 'Invalid intent' }, { status: 400 });
  }
};