/**
 * SQL Generator Service
 * Reusable natural language to SQL generation for DuckDB queries
 * Extracted from api.generate-sql.tsx for use across the application
 */

import { openai } from '~/services/openai.server';
import { SQLValidator } from '~/services/sql-validator.server';
import { aiModelConfig } from '~/services/ai-model-config.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('sql-generator');

/**
 * File context for SQL generation
 */
export interface SQLFileContext {
  id?: string;
  filename: string;
  tableName: string;
  schema: {
    columns: Array<{
      name: string;
      type: string;
    }>;
  };
  rowCount?: number;
  data?: any[];
}

/**
 * SQL generation result
 */
export interface SQLGenerationResult {
  sql: string;
  confidence: number;
  explanation: string;
  tables: string[];
  usedTables?: Array<{
    name: string;
    filename: string;
    fileId?: string;
    columnsUsed: string[];
  }>;
  error?: string;
}

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
 * SQL Generator Service
 * Converts natural language queries to DuckDB SQL
 */
export class SQLGenerator {
  /**
   * Generate SQL from natural language query
   */
  async generate(
    query: string,
    files: SQLFileContext[],
    requestId?: string
  ): Promise<SQLGenerationResult> {
    const rid = requestId || `sql-${Date.now()}`;

    if (!openai) {
      logger.error('[generate] OpenAI not configured', { requestId: rid });
      return {
        sql: '',
        confidence: 0,
        explanation: 'OpenAI API not configured',
        tables: [],
        error: 'OpenAI not configured'
      };
    }

    // Filter for structured data files only
    const dataFiles = files.filter(f => f.schema);

    if (dataFiles.length === 0) {
      logger.error('[generate] No structured data files found', { requestId: rid });
      return {
        sql: '',
        confidence: 0,
        explanation: 'No structured data files available for SQL generation',
        tables: [],
        error: 'No structured data files'
      };
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

      logger.trace('[generate] Calling OpenAI', {
        requestId: rid,
        tableCount: dataFiles.length,
        queryLength: query.length
      });

      // Build API parameters with GPT support
      const apiParams = aiModelConfig.buildAPIParameters({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        queryType: 'simple' // SQL generation is deterministic, uses minimal reasoning for speed
      });

      const completion = await openai.chat.completions.create(apiParams);

      const generatedSQL = completion.choices[0]?.message?.content?.trim() || '';

      logger.trace('[generate] OpenAI response received', {
        requestId: rid,
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
        logger.warn('[generate] SQL validation failed', {
          requestId: rid,
          sql: cleanedSQL,
          errors: validation.errors
        });
        return {
          sql: '',
          confidence: 0,
          explanation: `Unable to generate valid SQL: ${validation.errors.join(', ')}`,
          tables: dataFiles.map(f => f.tableName),
          error: 'SQL validation failed'
        };
      }

      // Log warnings but continue
      if (validation.warnings.length > 0) {
        logger.trace('[generate] SQL validation warnings', {
          requestId: rid,
          warnings: validation.warnings
        });
      }

      // Use sanitized SQL
      const finalSQL = validation.sanitizedSQL || cleanedSQL;

      logger.trace('[generate] SQL generated successfully', {
        requestId: rid,
        sqlLength: finalSQL.length,
        tokensUsed: completion.usage?.total_tokens || 0,
        hasWarnings: validation.warnings.length > 0
      });

      return {
        sql: finalSQL,
        confidence: 0.9,
        explanation: `Generated SQL query to analyze ${dataFiles.map(f => f.filename).join(', ')}`,
        tables: dataFiles.map(f => f.tableName),
        usedTables: dataFiles.map(f => ({
          name: f.tableName,
          filename: f.filename,
          fileId: f.id,
          columnsUsed: (f.schema?.columns || []).map((c: any) => c.name)
        }))
      };

    } catch (error) {
      logger.error('[generate] Failed to generate SQL', {
        requestId: rid,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        sql: '',
        confidence: 0,
        explanation: 'An error occurred while generating SQL. Please try again.',
        tables: [],
        error: error instanceof Error ? error.message : 'Failed to generate SQL'
      };
    }
  }
}

/**
 * Singleton instance for reuse
 */
export const sqlGenerator = new SQLGenerator();
