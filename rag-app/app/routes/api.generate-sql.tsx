import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import type { SQLGenerationResponse } from '~/services/duckdb/duckdb-query.client';
import { DebugLogger } from '~/utils/debug-logger';
import { openai } from '~/services/openai.server';
import { SQLValidator } from '~/services/sql-validator.server';
import { aiModelConfig } from '~/services/ai-model-config.server';

const logger = new DebugLogger('api:generate-sql');

/**
 * Normalize column name to match DuckDB's normalize_names behavior
 */
function normalizeColumnName(name: string): string {
  if (!name) return name;
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

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
 * Generate SQL from natural language query
 * Optimized for speed - no semantic analysis required
 */
async function generateSQL(
  query: string,
  files: Array<{
    filename: string;
    tableName: string;
    schema: any;
    rowCount?: number;
    data?: any[];
  }>,
  requestId: string
): Promise<string> {
  if (!openai) {
    logger.error('[generateSQL] OpenAI not configured', { requestId });
    return '';
  }

  // Filter for structured data files only
  const dataFiles = files.filter(f => f.schema);

  if (dataFiles.length === 0) {
    logger.error('[generateSQL] No structured data files found', { requestId });
    return '';
  }

  try {
    // Build schema context for each table
    const schemaContext = dataFiles.map(f => {
      const tableName = f.tableName;
      const columns = f.schema?.columns || [];

      // Build column descriptions with type info (ensure normalized names)
      const columnDescriptions = columns.map((c: any) => {
        const normalizedName = normalizeColumnName(c.name);
        return `${normalizedName} (${c.type})`;
      }).join(', ');

      // Get sample data if available
      let sampleRows = '';
      if (f.data && Array.isArray(f.data) && f.data.length > 0) {
        const sampleData = f.data.slice(0, 3);
        sampleRows = '\nSample rows:\n' + sampleData.map((row: any, idx: number) =>
          `Row ${idx + 1}: ${JSON.stringify(row)}`
        ).join('\n');
      }

      return `
Table: ${tableName}
Columns: ${columnDescriptions}
Row count: ${f.rowCount || 0}${sampleRows}
`;
    }).join('\n---\n');

    // Build the prompt for SQL generation
    const systemPrompt = `You are an expert SQL query generator. Generate DuckDB SQL queries based on natural language questions.

IMPORTANT RULES:
1. Generate ONLY SELECT queries (no INSERT, UPDATE, DELETE, DROP, ALTER, CREATE)
2. Use proper DuckDB SQL syntax
3. Table names are provided in the schema context - use them exactly as shown
4. Return ONLY the SQL query without explanations or markdown code blocks
5. Use appropriate WHERE clauses, JOINs, GROUP BY, ORDER BY as needed
6. For aggregations, always use descriptive column aliases
7. Limit results to 1000 rows unless specified otherwise
8. Use CAST() for explicit type conversions when needed

COLUMN NAME FORMAT:
- ALL column names use lowercase with underscores (snake_case)
- Spaces are converted to underscores: "Years of Experience" → years_of_experience
- Special characters are removed: "Salary (USD)" → salary_usd
- Never use quotes around column names
- Never use spaces in column names

Available tables and schemas:
${schemaContext}`;

    const userPrompt = `Generate a SQL query to answer this question: "${query}"

Return ONLY the SQL query.`;

    logger.trace('[generateSQL] Calling OpenAI', {
      requestId,
      tableCount: dataFiles.length,
      queryLength: query.length
    });

    // Build API parameters with GPT-5 support
    const apiParams = aiModelConfig.buildAPIParameters({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      queryType: 'simple' // SQL generation is deterministic, uses minimal reasoning for speed
    });

    const completion = await openai.chat.completions.create(apiParams);

    const generatedSQL = completion.choices[0]?.message?.content?.trim() || '';

    logger.trace('[generateSQL] OpenAI response received', {
      requestId,
      hasSql: !!generatedSQL,
      sqlLength: generatedSQL.length
    });

    // Remove markdown code blocks if present
    let cleanedSQL = generatedSQL
      .replace(/```sql\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    // Validate SQL
    const schemaInfo = dataFiles.map(f => ({
      tableName: f.tableName,
      columns: (f.schema?.columns || []).map((c: any) => ({
        name: c.name,
        type: c.type
      }))
    }));

    const validation = SQLValidator.validate(cleanedSQL, schemaInfo);

    if (!validation.valid) {
      logger.warn('[generateSQL] SQL validation failed', {
        requestId,
        sql: cleanedSQL,
        errors: validation.errors
      });
      return '';
    }

    // Log warnings but continue
    if (validation.warnings.length > 0) {
      logger.trace('[generateSQL] SQL validation warnings', {
        requestId,
        warnings: validation.warnings
      });
    }

    // Use sanitized SQL
    const finalSQL = validation.sanitizedSQL || cleanedSQL;

    logger.trace('[generateSQL] SQL generated successfully', {
      requestId,
      sqlLength: finalSQL.length,
      tokensUsed: completion.usage?.total_tokens || 0,
      hasWarnings: validation.warnings.length > 0
    });

    return finalSQL;

  } catch (error) {
    logger.error('[generateSQL] Failed to generate SQL', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return '';
  }
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

    // Generate SQL directly using OpenAI (no semantic analysis needed for speed)
    const sql = await generateSQL(query, files, requestId);

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
