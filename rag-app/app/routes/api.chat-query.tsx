import type { ActionFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { openai, SYSTEM_PROMPTS } from '~/services/openai.server';
import { requireUser } from '~/services/auth/auth.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('api.chat-query');

export interface ChatQueryRequest {
  query: string;
  pageId: string;
  workspaceId?: string;
  tables: Array<{
    name: string;
    schema: any;
    rowCount: number;
  }>;
}

export interface ChatQueryResponse {
  sql: string;
  tables: string[];
  explanation: string;
  confidence: number;
  suggestedVisualization?: 'table' | 'chart' | 'number';
  metadata: {
    tokensUsed: number;
    model: string;
  };
}

const SQL_GENERATION_PROMPT = `You are a DuckDB SQL expert. Convert natural language queries to valid DuckDB SQL.

IMPORTANT RULES:
1. Return ONLY valid DuckDB SQL that can be executed
2. Use the exact table names provided
3. Be careful with column names - use double quotes if they contain spaces
4. For summaries, include relevant aggregations and GROUP BY clauses
5. For calculations, use appropriate aggregate functions
6. Limit results to 1000 rows unless specified otherwise
7. Use DuckDB-specific functions when appropriate

Response format:
- sql: The SQL query (required)
- explanation: A brief explanation of what the query does
- tables: Array of table names used in the query
- confidence: Your confidence level (0-1)
- suggestedVisualization: 'table' for tabular data, 'chart' for trends/comparisons, 'number' for single values`;

export const action: ActionFunction = async ({ request }) => {
  try {
    // Require authentication
    const user = await requireUser(request);
    logger.trace('Chat query request', { userId: user.id });

    // Parse request body
    const body: ChatQueryRequest = await request.json();
    const { query, pageId, workspaceId, tables } = body;

    // Validate input
    if (!query || !pageId || !tables || tables.length === 0) {
      return json(
        { error: 'Missing required fields: query, pageId, or tables' },
        { status: 400 }
      );
    }

    // Check if OpenAI is configured
    if (!openai) {
      logger.error('OpenAI not configured');
      return json(
        { error: 'AI service not configured. Please add OPENAI_API_KEY to environment.' },
        { status: 503 }
      );
    }

    // Build context with table schemas
    const tableContext = tables.map(table => {
      const schemaInfo = table.schema?.columns 
        ? `Columns: ${table.schema.columns.map((c: any) => `${c.name} (${c.type})`).join(', ')}`
        : `Schema: ${JSON.stringify(table.schema)}`;
      
      return `Table: ${table.name}
${schemaInfo}
Row count: ${table.rowCount}`;
    }).join('\n\n');

    // Generate prompt
    const prompt = `Given these DuckDB tables:
${tableContext}

Convert this natural language query to SQL:
"${query}"

Remember to:
- Use exact table names as provided
- Include LIMIT clause for large results
- Use appropriate aggregations for summary requests
- Return only executable DuckDB SQL`;

    logger.trace('Generating SQL with OpenAI', { 
      query, 
      tableCount: tables.length,
      model: 'gpt-4-turbo-preview'
    });

    // Call OpenAI to generate SQL
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: SQL_GENERATION_PROMPT,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1, // Lower temperature for more deterministic SQL
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0].message.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    // Parse the response
    let result: any;
    try {
      result = JSON.parse(response);
    } catch (error) {
      logger.error('Failed to parse OpenAI response', { response });
      throw new Error('Invalid response format from AI');
    }

    // Validate SQL for safety
    const sql = result.sql;
    if (!sql) {
      throw new Error('No SQL generated');
    }

    // Check for dangerous operations
    const dangerousPatterns = [
      /\bDROP\s+/i,
      /\bDELETE\s+FROM\b/i,
      /\bTRUNCATE\b/i,
      /\bALTER\s+/i,
      /\bCREATE\s+(?!.*VIEW)/i, // Allow CREATE VIEW
      /\bINSERT\s+/i,
      /\bUPDATE\s+/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        logger.warn('Dangerous SQL pattern detected', { sql, pattern: pattern.source });
        return json(
          { error: 'Generated SQL contains potentially dangerous operations' },
          { status: 400 }
        );
      }
    }

    // Build response
    const responseData: ChatQueryResponse = {
      sql: sql.trim(),
      tables: result.tables || tables.map(t => t.name),
      explanation: result.explanation || 'Query generated successfully',
      confidence: result.confidence || 0.8,
      suggestedVisualization: result.suggestedVisualization || 'table',
      metadata: {
        tokensUsed: completion.usage?.total_tokens || 0,
        model: completion.model,
      },
    };

    logger.trace('SQL generated successfully', { 
      sql: responseData.sql,
      confidence: responseData.confidence 
    });

    return json(responseData);
  } catch (error) {
    logger.error('Chat query error:', error);
    
    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return json(
          { error: 'AI service configuration error' },
          { status: 503 }
        );
      }
      if (error.message.includes('rate limit')) {
        return json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429 }
        );
      }
    }

    return json(
      { 
        error: error instanceof Error ? error.message : 'Query processing failed',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
};