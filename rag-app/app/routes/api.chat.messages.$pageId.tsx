import type { LoaderFunction, ActionFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { prisma } from '~/utils/db.server';
import { requireUser } from '~/services/auth/auth.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('api.chat.messages');

// GET /api/chat/messages/:pageId - Fetch chat history
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

    // Fetch messages with pagination
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const messages = await prisma.chatMessage.findMany({
      where: {
        pageId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      skip: offset,
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    logger.trace('Fetched chat messages', { 
      pageId, 
      count: messages.length,
      userId: user.id 
    });

    return json({ messages });
  } catch (error) {
    logger.error('Failed to fetch chat messages:', error);
    return json(
      { error: 'Failed to fetch chat messages' },
      { status: 500 }
    );
  }
};

// POST /api/chat/messages/:pageId - Save new message
export const action: ActionFunction = async ({ request, params }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

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

    // Parse request body
    const body = await request.json();
    const { role, content, metadata } = body;

    // Validate input
    if (!role || !content) {
      return json(
        { error: 'Role and content are required' },
        { status: 400 }
      );
    }

    if (!['user', 'assistant', 'system'].includes(role)) {
      return json(
        { error: 'Invalid role. Must be user, assistant, or system' },
        { status: 400 }
      );
    }

    // Create message
    const message = await prisma.chatMessage.create({
      data: {
        pageId: page.id,
        workspaceId: page.workspaceId,
        userId: role === 'user' ? user.id : null,
        role,
        content,
        metadata: metadata || null,
      },
      select: {
        id: true,
        role: true,
        content: true,
        metadata: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    logger.trace('Created chat message', { 
      messageId: message.id,
      pageId,
      role,
      userId: user.id 
    });

    return json({ message });
  } catch (error) {
    logger.error('Failed to create chat message:', error);
    return json(
      { error: 'Failed to create chat message' },
      { status: 500 }
    );
  }
};