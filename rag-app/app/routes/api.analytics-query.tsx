import type { ActionFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { QueryParser } from '~/services/analytics/query-parser.server';
import { QueryExecutor } from '~/services/analytics/query-executor.server';
import { prisma } from '~/utils/db.server';

export const action: ActionFunction = async ({ request }) => {
  try {
    const formData = await request.formData();
    const query = formData.get('query') as string;
    const databaseBlockId = formData.get('databaseBlockId') as string;

    if (!query || !databaseBlockId) {
      return json(
        { success: false, error: 'Missing query or database block ID' },
        { status: 400 }
      );
    }

    // Fetch database columns for parsing context
    const databaseBlock = await prisma.databaseBlock.findUnique({
      where: { id: databaseBlockId },
      include: { columns: true }
    });

    if (!databaseBlock) {
      return json(
        { success: false, error: 'Database block not found' },
        { status: 404 }
      );
    }

    // Parse the natural language query
    const parsedQuery = QueryParser.parse(query, databaseBlock.columns);

    // Execute the query
    const result = await QueryExecutor.execute(parsedQuery, databaseBlockId);

    // Add intent and confidence to metadata
    if (result.success && result.metadata) {
      result.metadata.intent = parsedQuery.intent;
      result.metadata.confidence = parsedQuery.confidence;
    }

    return json(result);
  } catch (error) {
    console.error('Analytics query error:', error);
    return json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Query processing failed' 
      },
      { status: 500 }
    );
  }
};