/**
 * API Route: Fetch Full Spreadsheet Data
 *
 * TASK 87: Metadata-only pattern - Phase 2
 * This route fetches the full rows array for a specific spreadsheet block.
 * Used by SpreadsheetBlock component to load data into DuckDB WASM.
 *
 * Pattern matches api.chat.$pageId.ts (metadata-only chat pattern)
 */

import type { LoaderFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { prisma } from '~/utils/db.server';

/**
 * GET /api/blocks/:blockId/data
 *
 * Returns the full rows array for a spreadsheet block.
 * Authentication required - user must own the page containing the block.
 *
 * Response format:
 * {
 *   blockId: string;
 *   rows: any[];
 *   rowCount: number;
 *   tableName?: string;
 *   title?: string;
 * }
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  // Require authentication
  const user = await requireUser(request);

  const { blockId } = params;

  if (!blockId) {
    return json({ error: 'Block ID is required' }, { status: 400 });
  }

  try {
    // Find the page containing this block
    // Blocks are stored in Page.blocks JSONB field
    const page = await prisma.page.findFirst({
      where: {
        blocks: {
          path: ['$[*].id'],
          array_contains: blockId,
        },
        // Security: User must own the page
        createdBy: user.id,
      },
      select: {
        id: true,
        blocks: true,
      },
    });

    if (!page) {
      return json(
        { error: 'Block not found or access denied' },
        { status: 404 }
      );
    }

    // Parse blocks JSONB
    const blocks = Array.isArray(page.blocks)
      ? page.blocks
      : typeof page.blocks === 'string'
      ? JSON.parse(page.blocks)
      : [];

    // Find the specific block
    const block = blocks.find((b: any) => b.id === blockId);

    if (!block) {
      return json(
        { error: 'Block not found in page' },
        { status: 404 }
      );
    }

    // Verify it's a spreadsheet block
    if (block.type !== 'spreadsheet') {
      return json(
        { error: 'Block is not a spreadsheet' },
        { status: 400 }
      );
    }

    // Parse content
    const content = typeof block.content === 'string'
      ? (block.content.startsWith('{') ? JSON.parse(block.content) : block.content)
      : block.content;

    if (!content || typeof content !== 'object') {
      return json(
        { error: 'Invalid spreadsheet content' },
        { status: 500 }
      );
    }

    // Extract rows and metadata
    const rows = content.rows || [];
    const rowCount = Array.isArray(rows) ? rows.length : 0;

    console.log(`[API] Fetching full data for block ${blockId}: ${rowCount.toLocaleString()} rows`);

    // Return full data with metadata
    return json({
      blockId,
      rows,
      rowCount,
      tableName: content.tableName,
      title: content.title,
      columns: content.columns, // Include schema for DuckDB table creation
    });

  } catch (error) {
    console.error('[API] Error fetching block data:', error);
    return json(
      { error: 'Failed to fetch block data' },
      { status: 500 }
    );
  }
};
