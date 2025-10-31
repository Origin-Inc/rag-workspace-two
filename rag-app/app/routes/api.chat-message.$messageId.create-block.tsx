import { json, type ActionFunction } from '@remix-run/node';
import { prisma } from '~/utils/db.server';
import { requireUser } from '~/services/auth/auth.server';
import { DebugLogger } from '~/utils/debug-logger';
import { randomUUID, createHash } from 'crypto';

const logger = new DebugLogger('api.create-block');

/**
 * TASK 56.2: Create Block from Chat Message
 *
 * POST /api/chat-message/:messageId/create-block
 *
 * Converts a chat message with visualization metadata into a page block.
 * Extracts chart/table data from ChatMessage.metadata and creates a block
 * in Page.blocks with proper positioning and provenance tracking.
 */
export const action: ActionFunction = async ({ request, params }) => {
  const startTime = Date.now();
  const requestId = `create-block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Require authentication
    const user = await requireUser(request);
    const { messageId } = params;

    if (!messageId) {
      return json(
        { error: 'Message ID is required' },
        { status: 400 }
      );
    }

    logger.info('[Task 56.2] Starting block creation', {
      requestId,
      messageId,
      userId: user.id,
    });

    // 1. Retrieve ChatMessage with metadata
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: {
        page: {
          select: {
            id: true,
            workspaceId: true,
            blocks: true,
          },
        },
      },
    });

    if (!message) {
      logger.error('[Task 56.2] ChatMessage not found', {
        requestId,
        messageId,
      });
      return json(
        { error: 'Chat message not found' },
        { status: 404 }
      );
    }

    // Verify user has access to the workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: message.workspaceId,
        userWorkspaces: {
          some: {
            userId: user.id,
          },
        },
      },
    });

    if (!hasAccess) {
      logger.error('[Task 56.2] Access denied', {
        requestId,
        userId: user.id,
        workspaceId: message.workspaceId,
      });
      return json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // 2. Extract block data from metadata
    const metadata = message.metadata as any;

    if (!metadata) {
      logger.error('[Task 56.2] No metadata found in message', {
        requestId,
        messageId,
      });
      return json(
        { error: 'Message does not contain block data' },
        { status: 400 }
      );
    }

    logger.info('[Task 56.2] Metadata extracted', {
      requestId,
      hasChart: !!metadata.generatedChart,
      hasTable: !!metadata.generatedTable,
      queryIntent: metadata.queryIntent,
    });

    // Determine block type and content based on metadata
    let blockType: 'chart' | 'table' | 'text';
    let blockContent: any;
    let blockHeight: number;

    if (metadata.generatedChart) {
      // Create chart block
      blockType = 'chart';

      // DEBUG: Log the full chart metadata structure
      logger.info('[Task 56.2] DEBUG: Full chart metadata', {
        requestId,
        chartMetadata: JSON.stringify(metadata.generatedChart, null, 2),
        hasType: !!metadata.generatedChart.type,
        hasData: !!metadata.generatedChart.data,
        hasTitle: !!metadata.generatedChart.title,
        dataKeys: metadata.generatedChart.data ? Object.keys(metadata.generatedChart.data) : [],
      });

      // Match ChartBlock component's expected structure
      blockContent = {
        title: metadata.generatedChart.title,
        description: metadata.generatedChart.description,
        config: {
          type: metadata.generatedChart.type,
          data: metadata.generatedChart.data,
        },
      };
      blockHeight = 4; // Chart blocks: 4 rows

      logger.info('[Task 56.2] Creating chart block', {
        requestId,
        chartType: metadata.generatedChart.type,
        confidence: metadata.generatedChart.confidence,
        blockContentKeys: Object.keys(blockContent),
        hasConfig: !!blockContent.config,
        configType: blockContent.config?.type,
        hasConfigData: !!blockContent.config?.data,
      });
    } else if (metadata.generatedTable) {
      // Create table block
      blockType = 'table';
      blockContent = {
        columns: metadata.generatedTable.columns,
        rows: metadata.generatedTable.rows,
        title: metadata.generatedTable.title,
      };
      blockHeight = 6; // Table blocks: 6 rows

      logger.info('[Task 56.2] Creating table block', {
        requestId,
        columnCount: metadata.generatedTable.columns?.length || 0,
        rowCount: metadata.generatedTable.rows?.length || 0,
      });
    } else {
      // Create text/markdown block from message content
      blockType = 'text';
      blockContent = {
        text: message.content,
        format: 'markdown', // The content may contain markdown formatting
      };
      // Calculate height based on content length (roughly 2 rows per 200 chars, min 2, max 10)
      const estimatedRows = Math.max(2, Math.min(10, Math.ceil(message.content.length / 200)));
      blockHeight = estimatedRows;

      logger.info('[Task 56.2] Creating text block from message content', {
        requestId,
        contentLength: message.content.length,
        estimatedHeight: blockHeight,
      });
    }

    // 3. Get existing blocks and calculate position
    const existingBlocks = (message.page.blocks as any[]) || [];

    logger.info('[Task 56.2] Calculating block position', {
      requestId,
      existingBlockCount: existingBlocks.length,
    });

    // Calculate next Y position (stack blocks vertically)
    const nextY = existingBlocks.length === 0
      ? 0
      : Math.max(...existingBlocks.map((b: any) => (b.position?.y || 0) + (b.position?.height || 0)));

    const position = {
      x: 0,        // Start at left edge (12-column grid)
      y: nextY,    // Stack below existing blocks
      width: 12,   // Full width
      height: blockHeight,
    };

    logger.info('[Task 56.2] Position calculated', {
      requestId,
      position,
    });

    // 4. Create block with provenance metadata
    const blockId = randomUUID();
    const newBlock = {
      id: blockId,
      type: blockType,
      content: blockContent,
      position,
      metadata: {
        sourceMessageId: messageId,
        provenance: {
          generatedBy: {
            model: 'gpt-4o-mini', // Could be dynamic from env or config
            version: '2024-07-18',
            provider: 'OpenAI',
          },
          generatedAt: new Date().toISOString(),
          source: {
            type: 'chat_query' as const,
            sourceId: messageId,
            originalQuery: metadata.queryResultsSummary?.sampleRows?.[0]
              ? `Results from SQL: ${metadata.generatedSQL?.slice(0, 100)}...`
              : 'Query result visualization',
          },
          confidence: metadata.generatedChart?.confidence || 0.85,
          dataProvenance: {
            database: 'user_data',
            tables: [], // Could be extracted from SQL if needed
            queryHash: metadata.generatedSQL
              ? createHash('sha256').update(metadata.generatedSQL).digest('hex').slice(0, 16)
              : null,
            executedAt: metadata.queryExecution?.timestamp || new Date().toISOString(),
            rowCount: metadata.queryResultsSummary?.rowCount || 0,
          },
        },
      },
    };

    logger.info('[Task 56.2] Block created', {
      requestId,
      blockId,
      blockType,
      hasProvenance: !!newBlock.metadata.provenance,
      contentKeys: Object.keys(blockContent),
      contentPreview: blockType === 'chart' ? {
        hasConfig: !!blockContent.config,
        hasConfigData: !!blockContent.config?.data,
        configType: blockContent.config?.type,
      } : null,
    });

    // 5. Update Page.blocks using fetch-update-save pattern
    // (Prisma doesn't support direct JSONB append, so we fetch, modify, and save)
    const updatedBlocks = [...existingBlocks, newBlock];

    await prisma.page.update({
      where: { id: message.pageId },
      data: {
        blocks: updatedBlocks,
        updatedAt: new Date(),
      },
    });

    const totalTime = Date.now() - startTime;

    logger.info('[Task 56.2] Block creation complete', {
      requestId,
      blockId,
      blockType,
      totalTimeMs: totalTime,
      totalBlocksNow: updatedBlocks.length,
    });

    // 6. Return created block
    return json({
      success: true,
      block: newBlock,
      metadata: {
        blockId,
        blockType,
        position,
        processingTimeMs: totalTime,
        sourceMessageId: messageId,
      },
    });

  } catch (error) {
    logger.error('[Task 56.2] Block creation failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    return json(
      {
        error: 'Failed to create block',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
};
