import type { ActionFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { openai, SYSTEM_PROMPTS } from '~/services/openai.server';
import { requireUser } from '~/services/auth/auth.server';
import { DebugLogger } from '~/utils/debug-logger';
import { ContextWindowManager } from '~/services/context-window-manager.server';

const logger = new DebugLogger('api.chat-query');

export interface ChatQueryRequest {
  query: string;
  pageId: string;
  workspaceId?: string;
  tables: Array<{
    id?: string;
    name: string;
    schema: any;
    rowCount: number;
    data?: any[]; // Sample data for better context
  }>;
  conversationHistory?: Array<{ role: string; content: string }>; // Previous messages for context
  model?: string; // Allow specifying model for token limits
}

export interface ChatQueryResponse {
  sql: string;
  tables: string[];
  explanation: string;
  confidence: number;
  suggestedVisualization?: 'table' | 'chart' | 'number';
  usedTables?: Array<{
    name: string;
    filename: string;
    fileId?: string;
    columnsUsed?: string[];
  }>;
  metadata: {
    tokensUsed: number;
    contextTokens?: number; // Tokens used in context
    model: string;
  };
}

// Function to parse SQL and extract used tables with their columns
function parseUsedTables(sql: string, availableTables: ChatQueryRequest['tables']): Array<{
  name: string;
  filename: string;
  fileId?: string;
  columnsUsed?: string[];
}> {
  const usedTables: Array<{
    name: string;
    filename: string;
    fileId?: string;
    columnsUsed?: string[];
  }> = [];
  
  // Normalize SQL for parsing (remove comments, handle line breaks)
  const normalizedSql = sql
    .replace(/--.*$/gm, '') // Remove line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .toUpperCase();
  
  // Extract table names from FROM and JOIN clauses
  const tablePattern = /(?:FROM|JOIN)\s+([^\s,()]+)/gi;
  const matches = normalizedSql.matchAll(tablePattern);
  
  const foundTableNames = new Set<string>();
  for (const match of matches) {
    const tableName = match[1].replace(/["'`]/g, ''); // Remove quotes
    foundTableNames.add(tableName.toLowerCase());
  }
  
  // Map found tables to available table metadata
  for (const tableName of foundTableNames) {
    const tableInfo = availableTables.find(t => 
      t.name.toLowerCase() === tableName.toLowerCase()
    );
    
    if (tableInfo) {
      // Extract columns used for this table
      const columnsUsed = new Set<string>();
      
      // Pattern to find columns (simplified - handles most common cases)
      // Looks for tablename.column or "column" after SELECT, WHERE, GROUP BY, ORDER BY
      const columnPattern = new RegExp(
        `(?:SELECT|WHERE|GROUP\\s+BY|ORDER\\s+BY|ON).*?(?:${tableName}\\.["']?([\\w_]+)["']?|["']([\\w_]+)["'])`,
        'gi'
      );
      
      const columnMatches = sql.matchAll(columnPattern);
      for (const colMatch of columnMatches) {
        const columnName = colMatch[1] || colMatch[2];
        if (columnName && tableInfo.schema?.columns) {
          // Verify column exists in schema
          const exists = tableInfo.schema.columns.some(
            col => col.name.toLowerCase() === columnName.toLowerCase()
          );
          if (exists) {
            columnsUsed.add(columnName);
          }
        }
      }
      
      usedTables.push({
        name: tableInfo.name,
        filename: tableInfo.name, // Use the table name as filename for now
        fileId: tableInfo.id,
        columnsUsed: columnsUsed.size > 0 ? Array.from(columnsUsed) : undefined,
      });
    }
  }
  
  return usedTables;
}

const SQL_GENERATION_PROMPT = `You are a friendly data analyst having a conversation. Help users understand their data by writing SQL queries and explaining the results in natural, conversational language.

IMPORTANT RULES:
1. Generate valid DuckDB SQL that can be executed
2. Use the exact table names provided
3. ALWAYS wrap ALL column names in double quotes (e.g., "column_name") - this handles spaces, numbers, special characters, and SQL keywords
4. For summaries, include relevant aggregations and GROUP BY clauses
5. For calculations, use appropriate aggregate functions
6. Limit results to 1000 rows unless specified otherwise
7. Be careful with data types - don't cast years to dates, keep them as numbers
8. Write responses as if you're having a friendly conversation

You must return a valid JSON object with this structure:
{
  "sql": "SELECT * FROM table_name LIMIT 10",
  "explanation": "Your conversational response here",
  "dataContext": "What you notice about this data",
  "tables": ["table_name"],
  "confidence": 0.9,
  "suggestedVisualization": "table",
  "insights": "Interesting findings or suggestions"
}

RESPONSE STYLE GUIDELINES:
- Start with what you found or what the data is about
- Use natural language like "I found...", "This shows...", "Looking at your data..."
- For summaries, begin with something like "This dataset contains..." or "You have data about..."
- Mention specific numbers and findings naturally in sentences
- Suggest what else might be interesting to explore
- Be concise but friendly and informative

When asked to "summarize" data:
- Start with: "This [file/dataset] contains data about..."
- Then: "Here's what I found..."
- Include key statistics naturally in your explanation
- End with: "You might also want to explore..." or similar suggestions

Example explanation for a summary:
"This dataset contains information about student performance across 1 million records. I can see it tracks weekly study hours (averaging 15 hours), attendance percentages (around 85%), and test scores. The data includes 5 different grade levels. You might want to explore the correlation between study hours and final scores, or see how attendance impacts performance."

Remember: Be conversational, helpful, and make the data accessible to non-technical users.`;

export const action: ActionFunction = async ({ request }) => {
  try {
    // Require authentication
    const user = await requireUser(request);
    logger.trace('Chat query request', { userId: user.id });

    // Parse request body
    const body: ChatQueryRequest = await request.json();
    const { query, pageId, workspaceId, tables, conversationHistory, model = 'gpt-4-turbo-preview' } = body;

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

    // Convert tables to format expected by ContextWindowManager
    const dataFiles = tables.map((table, index) => ({
      id: table.id || `table-${index}`,
      filename: table.name,
      schema: {
        columns: table.schema?.columns || [],
        rowCount: table.rowCount,
      },
      data: table.data, // Include sample data if provided
    }));

    // Build context window using ContextWindowManager with query-aware prioritization
    const contextWindow = ContextWindowManager.buildQueryAwareContext(
      query,
      conversationHistory || [],
      dataFiles,
      {
        model,
        maxTokens: model === 'gpt-4' ? 8192 : 128000, // Use model-specific limits
      }
    );

    // Extract context from window items
    const contextItems = contextWindow.items.filter(item => 
      item.type === 'schema' || item.type === 'data'
    );
    
    const tableContext = contextItems.map(item => item.content).join('\n\n');
    
    // Log token usage for monitoring
    logger.trace('Context window built', {
      totalTokens: contextWindow.totalTokens,
      maxTokens: contextWindow.maxTokens,
      itemCount: contextWindow.items.length,
      hasMore: contextWindow.hasMore,
    });

    // Generate prompt
    const prompt = `Given these DuckDB tables:
${tableContext}

Convert this natural language query to SQL:
"${query}"

Remember to:
- Use exact table names as provided
- ALWAYS quote ALL column names with double quotes
- Include LIMIT clause for large results
- Use appropriate aggregations for summary requests
- Return only executable DuckDB SQL
- Respond with a valid JSON object containing the SQL and metadata`;

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

    // Parse SQL to identify which tables are actually used
    const usedTables = parseUsedTables(sql, tables);
    
    // Build response
    const responseData: ChatQueryResponse = {
      sql: sql.trim(),
      tables: result.tables || tables.map(t => t.name),
      explanation: result.explanation || 'Query generated successfully',
      confidence: result.confidence || 0.8,
      suggestedVisualization: result.suggestedVisualization || 'table',
      usedTables: usedTables.length > 0 ? usedTables : undefined,
      metadata: {
        tokensUsed: completion.usage?.total_tokens || 0,
        contextTokens: contextWindow.totalTokens,
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