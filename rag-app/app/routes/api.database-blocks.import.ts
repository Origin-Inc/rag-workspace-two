import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';
import { requireAuth } from '~/services/auth/auth.server';
import { DatabaseBlockService } from '~/services/database-block.server';
import { DatabaseBlockCacheService } from '~/services/database-block-cache.server';
import { z } from 'zod';
import type { DatabaseColumn, DatabaseRow } from '~/types/database-block';

const importSchema = z.object({
  workspaceId: z.string(),
  pageId: z.string(),
  name: z.string(),
  columns: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['text', 'number', 'checkbox', 'select', 'multi_select', 'date', 'datetime', 'person', 'url', 'email', 'phone', 'currency', 'percent', 'rating', 'formula', 'files']),
    position: z.number(),
    width: z.number().optional(),
  })),
  rows: z.array(z.object({
    id: z.string(),
    blockId: z.string().optional(),
    cells: z.record(z.any()),
    position: z.number(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
});

export const action: ActionFunction = async ({ request }) => {
  try {
    // Authenticate user
    const session = await requireAuth(request);
    const userId = session.userId;

    // Parse request body
    const body = await request.json();
    const validatedData = importSchema.parse(body);

    // Create the database block
    const databaseBlock = await DatabaseBlockService.createBlock({
      workspaceId: validatedData.workspaceId,
      pageId: validatedData.pageId,
      name: validatedData.name,
      columns: validatedData.columns,
      rows: [],
      filters: [],
      sorts: [],
      views: [{
        id: `view_${Date.now()}`,
        name: 'Table',
        type: 'table',
        properties: {
          columnOrder: validatedData.columns.map(col => col.id),
          columnWidths: validatedData.columns.reduce((acc, col) => ({
            ...acc,
            [col.id]: col.width || 150
          }), {}),
          rowHeight: 'medium',
          showLineNumbers: false,
          wrapText: false,
        },
        filters: [],
        sorts: [],
        groupBy: null,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    });

    // Add rows in batches to avoid overwhelming the database
    const BATCH_SIZE = 100;
    const rows = validatedData.rows.map(row => ({
      ...row,
      blockId: databaseBlock.id,
    }));

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await DatabaseBlockService.createRows(databaseBlock.id, batch);
    }

    // Clear cache for this block to ensure fresh data
    const cacheService = DatabaseBlockCacheService.getInstance();
    await cacheService.invalidate(databaseBlock.id);

    // Return the created block with basic info
    return json({
      success: true,
      block: {
        id: databaseBlock.id,
        name: databaseBlock.name,
        pageId: databaseBlock.pageId,
        workspaceId: databaseBlock.workspaceId,
        columnCount: validatedData.columns.length,
        rowCount: rows.length,
      }
    });
  } catch (error) {
    console.error('Import error:', error);
    
    if (error instanceof z.ZodError) {
      return json(
        { 
          success: false, 
          error: 'Invalid data format',
          details: error.errors 
        },
        { status: 400 }
      );
    }

    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to import data' 
      },
      { status: 500 }
    );
  }
};