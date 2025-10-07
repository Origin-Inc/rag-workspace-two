import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { UnifiedIntelligenceService } from '~/services/unified-intelligence.server';
import type { SQLGenerationResponse } from '~/services/duckdb/duckdb-query.client';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('api:generate-sql');

/**
 * Request contract for SQL generation
 */
interface GenerateSQLRequest {
  query: string;
  pageId: string;
  workspaceId?: string;
  files: Array<{
    id?: string;
    filename: string;
    tableName: string;
    schema: any;
    rowCount?: number;
    data?: any[];
  }>;
  conversationHistory?: Array<{ role: string; content: string }>;
  model?: string;
}

/**
 * Dedicated endpoint for natural language to SQL generation
 *
 * Purpose: Lightweight, optimized endpoint for query-first architecture
 * - Skips semantic analysis, statistics, and presentation layers
 * - Returns raw SQL with metadata for client-side execution
 * - Target response time: <1s
 *
 * @returns SQLGenerationResponse with generated SQL and metadata
 */
export async function action({ request }: ActionFunctionArgs) {
  const requestId = `sql-gen-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  logger.trace('[generate-sql] Request started', { requestId });

  try {
    // Authenticate user
    const user = await requireUser(request);
    logger.trace('[generate-sql] User authenticated', { userId: user.id, requestId });

    // Parse and validate request
    const body = await request.json() as GenerateSQLRequest;
    const { query, pageId, workspaceId, files, conversationHistory, model } = body;

    // Validate required fields
    if (!query || !query.trim()) {
      logger.error('[generate-sql] Missing query', { requestId });
      return json(
        {
          sql: '',
          explanation: 'Query is required',
          confidence: 0,
          tables: [],
          error: 'Query is required'
        } as SQLGenerationResponse,
        { status: 400 }
      );
    }

    if (!files || files.length === 0) {
      logger.error('[generate-sql] No files provided', { requestId });
      return json(
        {
          sql: '',
          explanation: 'No data files available for SQL generation',
          confidence: 0,
          tables: [],
          error: 'No data files provided'
        } as SQLGenerationResponse,
        { status: 400 }
      );
    }

    logger.trace('[generate-sql] Request validated', {
      requestId,
      query: query.slice(0, 100),
      filesCount: files.length,
      hasConversationHistory: !!conversationHistory,
      model: model || 'gpt-4-turbo-preview'
    });

    // Log file details for debugging
    files.forEach((file, idx) => {
      logger.trace('[generate-sql] File context', {
        requestId,
        fileIndex: idx,
        filename: file.filename,
        tableName: file.tableName,
        hasSchema: !!file.schema,
        schemaColumns: file.schema?.columns?.length || 0,
        hasData: !!file.data,
        dataLength: file.data?.length || 0,
        rowCount: file.rowCount
      });
    });

    // Initialize intelligence service
    const intelligence = new UnifiedIntelligenceService();

    // Generate SQL using the existing generateContextAwareSQL method
    // This method is already optimized for SQL generation with proper schema context
    const sql = await intelligence['generateContextAwareSQL'](
      query,
      files.map(f => ({
        id: f.id || f.filename,
        filename: f.filename,
        type: f.filename.toLowerCase().endsWith('.csv') ? 'csv' : 'excel',
        schema: f.schema,
        data: f.data,
        rowCount: f.rowCount,
      })),
      {
        intent: 'data_query',
        confidence: 0.9,
        needsDataAccess: true,
        formatPreference: 'table',
        suggestedFiles: files.map(f => f.filename)
      }
    );

    logger.trace('[generate-sql] SQL generated', {
      requestId,
      hasSql: !!sql,
      sqlLength: sql?.length || 0,
      sqlPreview: sql?.slice(0, 100)
    });

    // Build response
    const response: SQLGenerationResponse = {
      sql: sql || '',
      explanation: sql
        ? `Generated SQL query to analyze ${files.map(f => f.filename).join(', ')}`
        : 'Unable to generate SQL query. Please rephrase your question or check the data structure.',
      confidence: sql ? 0.9 : 0,
      tables: files.map(f => f.tableName),
      suggestedVisualization: 'table',
      usedTables: sql ? files.map(f => ({
        name: f.tableName,
        filename: f.filename,
        fileId: f.id,
        columnsUsed: f.schema?.columns?.map((c: any) => c.name) || []
      })) : []
    };

    logger.trace('[generate-sql] Response prepared', {
      requestId,
      hasSql: !!response.sql,
      confidence: response.confidence,
      tablesCount: response.tables.length,
      usedTablesCount: response.usedTables?.length || 0
    });

    return json(response);

  } catch (error) {
    logger.error('[generate-sql] Error generating SQL', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    // Return error response in expected format
    return json(
      {
        sql: '',
        explanation: 'An error occurred while generating SQL. Please try again.',
        confidence: 0,
        tables: [],
        error: error instanceof Error ? error.message : 'Failed to generate SQL'
      } as SQLGenerationResponse,
      { status: 500 }
    );
  }
}
