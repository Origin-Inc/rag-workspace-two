import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { ContextPersistenceService } from '~/services/shared/context-persistence.server';
import { DebugLogger } from '~/utils/debug-logger';
import { prisma } from '~/utils/db.server';
import { z } from 'zod';

const logger = new DebugLogger('api.context');

/**
 * Validation schema for context updates
 *
 * Validates incoming context data to ensure:
 * - activeFileId is a valid UUID or null
 * - currentTopic is a string or null
 * - entities is an object with string arrays
 * - preferences is a flexible object
 */
const contextUpdateSchema = z.object({
  activeFileId: z.string().uuid().nullable().optional(),
  currentTopic: z.string().nullable().optional(),
  entities: z.record(z.array(z.string())).optional(),
  preferences: z.record(z.any()).optional(),
});

/**
 * GET /api/context/:pageId
 *
 * Load conversation context and query history for a page.
 * Returns empty defaults if context doesn't exist yet.
 *
 * Response:
 * {
 *   context: {
 *     activeFile: DataFile | null,
 *     currentTopic: string | null,
 *     entities: Record<string, string[]>,
 *     preferences: Record<string, any>
 *   },
 *   queryHistory: QueryHistoryEntry[]
 * }
 */
export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const user = await requireUser(request);
    const { pageId } = params;

    logger.trace('Loading context', { pageId, userId: user.id });

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
      logger.warn('Page not found or access denied', { pageId, userId: user.id });
      return json({ error: 'Page not found or access denied' }, { status: 404 });
    }

    // Load context with recent query history
    const { context, history } = await ContextPersistenceService.getContextWithHistory(
      pageId,
      10 // Last 10 queries
    );

    logger.debug('Context loaded', {
      pageId,
      hasActiveFile: !!context.activeFile,
      hasTopic: !!context.currentTopic,
      entityCount: Object.keys(context.entities).length,
      historyCount: history.length,
    });

    return json({
      context: {
        activeFile: context.activeFile,
        currentTopic: context.currentTopic,
        entities: context.entities,
        preferences: context.preferences,
      },
      queryHistory: history,
    });
  } catch (error: any) {
    logger.error('Failed to load context:', error);

    const errorMessage = error?.message || 'Failed to load context';
    const isAuthError = errorMessage.includes('auth') || errorMessage.includes('user') || errorMessage.includes('session');

    return json(
      {
        error: 'Failed to load context',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        type: isAuthError ? 'auth' : 'unknown',
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}

/**
 * POST /api/context/:pageId
 *
 * Create or update conversation context for a page.
 * Uses upsert to handle both creation and updates.
 *
 * Request body:
 * {
 *   activeFileId?: string | null,
 *   currentTopic?: string | null,
 *   entities?: Record<string, string[]>,
 *   preferences?: Record<string, any>
 * }
 *
 * Response:
 * { success: true } or { error: string }
 */
export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const user = await requireUser(request);
    const { pageId } = params;

    logger.trace('Saving context', { pageId, userId: user.id });

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
      logger.warn('Page not found or access denied', { pageId, userId: user.id });
      return json({ error: 'Page not found or access denied' }, { status: 404 });
    }

    // Parse and validate request body
    const body = await request.json();
    const result = contextUpdateSchema.safeParse(body);

    if (!result.success) {
      logger.warn('Invalid context data', {
        pageId,
        errors: result.error.flatten(),
      });
      return json(
        {
          error: 'Invalid context data',
          details: result.error.flatten(),
        },
        { status: 400 }
      );
    }

    logger.debug('Context validation passed', {
      pageId,
      updates: Object.keys(result.data),
    });

    // Upsert context (create if doesn't exist, update if exists)
    await ContextPersistenceService.upsertContext(
      pageId,
      page.workspaceId,
      result.data
    );

    logger.info('Context saved successfully', {
      pageId,
      workspaceId: page.workspaceId,
      userId: user.id,
      updates: Object.keys(result.data),
    });

    return json({ success: true });
  } catch (error: any) {
    logger.error('Failed to save context:', error);

    const errorMessage = error?.message || 'Failed to save context';
    const isAuthError = errorMessage.includes('auth') || errorMessage.includes('user') || errorMessage.includes('session');

    return json(
      {
        error: 'Failed to save context',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        type: isAuthError ? 'auth' : 'unknown',
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
