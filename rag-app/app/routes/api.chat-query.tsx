import { json } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { queryIntentAnalyzer } from "~/services/query-intent-analyzer.server";
import { UnifiedIntelligenceService } from "~/services/unified-intelligence.server";
import { ResponseComposer } from "~/services/response-composer.server";
import { getDuckDB } from "~/services/duckdb/duckdb-service.server";
import { createChatCompletion, isOpenAIConfigured } from "~/services/openai.server";
import { requireUser } from '~/services/auth/auth.server';
import { DebugLogger } from '~/utils/debug-logger';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const logger = new DebugLogger('api.chat-query');

export const action: ActionFunction = async ({ request }) => {
  try {
    // Require authentication
    const user = await requireUser(request);
    logger.trace('Unified query request', { userId: user.id });

    if (!isOpenAIConfigured()) {
      return json(
        { 
          content: "AI features are not configured. Please set up your OpenAI API key.",
          metadata: { error: "OpenAI not configured" }
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { query, files, pageId, workspaceId, conversationHistory } = body;

    if (!query || !files || files.length === 0) {
      return json(
        { 
          content: "Please provide a query and at least one file to analyze.",
          metadata: { error: "Missing query or files" }
        },
        { status: 400 }
      );
    }

    // Analyze query intent
    const intent = queryIntentAnalyzer.analyzeIntent(query);
    logger.trace('[Unified] Query intent:', {
      query,
      formatPreference: intent.formatPreference,
      queryType: intent.queryType,
      confidence: intent.confidence
    });

    // Initialize services
    const intelligence = new UnifiedIntelligenceService();
    const composer = new ResponseComposer();

    // Prepare file data based on type
    const fileData = await prepareFileData(files, pageId);
    
    // Perform unified analysis
    const analysis = await intelligence.analyze({
      query,
      intent,
      files: fileData,
      conversationHistory: conversationHistory || []
    });

    logger.trace('[Unified] Analysis complete:', {
      hasSemanticAnalysis: !!analysis.semanticAnalysis,
      hasStatisticalAnalysis: !!analysis.statisticalAnalysis,
      keyFindings: analysis.keyFindings?.length || 0
    });

    // Compose natural response
    const response = await composer.compose({
      query,
      intent,
      analysis,
      context: {
        files: files.map((f: any) => f.filename),
        pageId,
        workspaceId
      }
    });

    // Track token usage
    const tokenMetadata = {
      model: 'gpt-4-turbo-preview',
      contextTokens: analysis.metadata?.contextTokens || 0,
      responseTokens: analysis.metadata?.responseTokens || 0,
      totalTokens: analysis.metadata?.totalTokens || 0,
      intent: intent.formatPreference,
      confidence: intent.confidence
    };

    logger.trace('[Unified] Response composed:', {
      contentLength: response.content.length,
      hasMetadata: !!response.metadata
    });

    return json({
      content: response.content,
      metadata: {
        ...response.metadata,
        ...tokenMetadata,
        files: files.map((f: any) => f.filename),
        queryType: intent.queryType,
        formatPreference: intent.formatPreference
      }
    });

  } catch (error) {
    logger.error('[Unified] Query error:', error);
    
    // Provide a helpful error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return json(
      {
        content: `I encountered an error while processing your request: ${errorMessage}\n\nPlease try rephrasing your query or ensure the files are properly loaded.`,
        metadata: { 
          error: errorMessage,
          stack: process.env.NODE_ENV === 'development' ? 
            (error instanceof Error ? error.stack : undefined) : undefined
        }
      },
      { status: 500 }
    );
  }
};

/**
 * Prepare file data for analysis based on file type
 */
async function prepareFileData(files: any[], pageId: string) {
  const preparedFiles = [];
  const duckdb = await getDuckDB();
  
  for (const file of files) {
    const fileInfo: any = {
      filename: file.filename,
      tableName: file.tableName,
      type: getFileType(file.filename),
      schema: file.schema,
      rowCount: file.rowCount
    };

    try {
      // For PDFs, get the actual content from the database
      if (fileInfo.type === 'pdf') {
        const query = `SELECT * FROM "${file.tableName}" LIMIT 100`;
        const result = await duckdb.query(query);
        
        if (result.success && result.data) {
          // Extract text content from the PDF data
          fileInfo.content = result.data.map((row: any) => ({
            page: row.page_number || row.page_numbers || 1,
            text: row.text || row.content || row.chunk_text || '',
            chunk: row.chunk_index || row.chunk_id || 0
          }));
          
          // Get sample for semantic analysis
          fileInfo.sample = result.data
            .slice(0, 20)
            .map((r: any) => r.text || r.content || r.chunk_text || '')
            .filter(text => text.length > 0)
            .join('\n\n');
          
          // Get document metadata
          const metaQuery = `
            SELECT 
              COUNT(DISTINCT COALESCE(page_number, page_numbers, 1)) as page_count,
              COUNT(*) as chunk_count,
              MIN(COALESCE(page_number, page_numbers, 1)) as first_page,
              MAX(COALESCE(page_number, page_numbers, 1)) as last_page
            FROM "${file.tableName}"
          `;
          const metaResult = await duckdb.query(metaQuery);
          
          if (metaResult.success && metaResult.data?.[0]) {
            fileInfo.documentMetadata = metaResult.data[0];
          }
        }
      } 
      // For structured data files (CSV, Excel), get sample data and statistics
      else if (fileInfo.type === 'csv' || fileInfo.type === 'excel') {
        // Get sample data
        const sampleQuery = `SELECT * FROM "${file.tableName}" LIMIT 20`;
        const sampleResult = await duckdb.query(sampleQuery);
        
        if (sampleResult.success && sampleResult.data) {
          fileInfo.sampleData = sampleResult.data;
        }
        
        // Get column statistics
        fileInfo.columnStats = await getColumnStatistics(file.tableName, duckdb);
        
        // Get data summary
        const summaryQuery = `
          SELECT COUNT(*) as total_rows
          FROM "${file.tableName}"
        `;
        const summaryResult = await duckdb.query(summaryQuery);
        
        if (summaryResult.success && summaryResult.data?.[0]) {
          fileInfo.datasetMetadata = summaryResult.data[0];
        }
      }
      // For text files, get the content directly
      else if (fileInfo.type === 'text' || fileInfo.type === 'markdown') {
        const query = `SELECT * FROM "${file.tableName}" LIMIT 100`;
        const result = await duckdb.query(query);
        
        if (result.success && result.data) {
          fileInfo.content = result.data.map((row: any) => 
            row.content || row.text || ''
          ).join('\n');
          
          fileInfo.sample = fileInfo.content.slice(0, 2000);
        }
      }
    } catch (error) {
      logger.error(`Failed to prepare data for ${file.filename}:`, error);
      // Continue with basic info even if detailed fetching fails
      fileInfo.error = error instanceof Error ? error.message : 'Failed to fetch file data';
    }
    
    preparedFiles.push(fileInfo);
  }
  
  return preparedFiles;
}

/**
 * Get file type from filename
 */
function getFileType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'csv':
      return 'csv';
    case 'xlsx':
    case 'xls':
      return 'excel';
    case 'txt':
      return 'text';
    case 'md':
      return 'markdown';
    case 'json':
      return 'json';
    case 'xml':
      return 'xml';
    default:
      return 'unknown';
  }
}

/**
 * Get column statistics for structured data
 */
async function getColumnStatistics(tableName: string, duckdb: any) {
  try {
    const stats: any = {};
    
    // Get schema information
    const schemaQuery = `DESCRIBE SELECT * FROM "${tableName}"`;
    const schemaResult = await duckdb.query(schemaQuery);
    
    if (schemaResult.success && schemaResult.data) {
      for (const col of schemaResult.data) {
        const colName = col.column_name;
        const colType = col.column_type;
        
        stats[colName] = {
          type: colType,
          nullable: col.null === 'YES'
        };
        
        // Get statistics based on column type
        if (colType.includes('INT') || colType.includes('DOUBLE') || 
            colType.includes('DECIMAL') || colType.includes('FLOAT')) {
          // Numeric column statistics
          const statsQuery = `
            SELECT 
              MIN("${colName}") as min,
              MAX("${colName}") as max,
              AVG("${colName}") as avg,
              MEDIAN("${colName}") as median,
              STDDEV("${colName}") as stddev,
              COUNT(DISTINCT "${colName}") as distinct_count,
              COUNT("${colName}") as non_null_count,
              COUNT(*) - COUNT("${colName}") as null_count
            FROM "${tableName}"
          `;
          const statsResult = await duckdb.query(statsQuery);
          if (statsResult.success && statsResult.data?.[0]) {
            Object.assign(stats[colName], statsResult.data[0]);
          }
        } else if (colType.includes('VARCHAR') || colType.includes('TEXT')) {
          // Text column statistics
          const statsQuery = `
            SELECT 
              COUNT(DISTINCT "${colName}") as distinct_count,
              COUNT("${colName}") as non_null_count,
              COUNT(*) - COUNT("${colName}") as null_count,
              MIN(LENGTH("${colName}")) as min_length,
              MAX(LENGTH("${colName}")) as max_length,
              AVG(LENGTH("${colName}")) as avg_length
            FROM "${tableName}"
            WHERE "${colName}" IS NOT NULL
          `;
          const statsResult = await duckdb.query(statsQuery);
          if (statsResult.success && statsResult.data?.[0]) {
            Object.assign(stats[colName], statsResult.data[0]);
            
            // Get top values for categorical data
            if (statsResult.data[0].distinct_count <= 20) {
              const topValuesQuery = `
                SELECT 
                  "${colName}" as value, 
                  COUNT(*) as count
                FROM "${tableName}"
                WHERE "${colName}" IS NOT NULL
                GROUP BY "${colName}"
                ORDER BY count DESC
                LIMIT 10
              `;
              const topValuesResult = await duckdb.query(topValuesQuery);
              if (topValuesResult.success && topValuesResult.data) {
                stats[colName].topValues = topValuesResult.data;
              }
            }
          }
        } else if (colType.includes('DATE') || colType.includes('TIMESTAMP')) {
          // Date column statistics
          const statsQuery = `
            SELECT 
              MIN("${colName}") as min_date,
              MAX("${colName}") as max_date,
              COUNT(DISTINCT "${colName}") as distinct_count,
              COUNT("${colName}") as non_null_count,
              COUNT(*) - COUNT("${colName}") as null_count
            FROM "${tableName}"
          `;
          const statsResult = await duckdb.query(statsQuery);
          if (statsResult.success && statsResult.data?.[0]) {
            Object.assign(stats[colName], statsResult.data[0]);
          }
        }
      }
    }
    
    return stats;
  } catch (error) {
    logger.error('Failed to get column statistics:', error);
    return {};
  }
}