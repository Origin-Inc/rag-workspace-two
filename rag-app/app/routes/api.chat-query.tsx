import { json } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { queryIntentAnalyzer } from "~/services/query-intent-analyzer.server";
import { UnifiedIntelligenceService } from "~/services/unified-intelligence.server";
import { ResponseComposer } from "~/services/response-composer.server";
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
 * Simplified version without DuckDB dependency for server-side processing
 */
async function prepareFileData(files: any[], pageId: string) {
  const preparedFiles = [];
  
  for (const file of files) {
    const fileInfo: any = {
      filename: file.filename,
      tableName: file.tableName,
      type: getFileType(file.filename),
      schema: file.schema,
      rowCount: file.rowCount
    };

    // For PDFs, we'll pass basic metadata
    // The actual content would come from the client or be stored in the database
    if (fileInfo.type === 'pdf') {
      // Add PDF-specific metadata if available
      fileInfo.documentMetadata = {
        page_count: file.pageCount || 1,
        chunk_count: file.chunkCount || file.rowCount || 0
      };
      
      // If content is provided in the request, use it
      if (file.content) {
        fileInfo.content = file.content;
        fileInfo.sample = Array.isArray(file.content) 
          ? file.content.slice(0, 5).map((c: any) => c.text || '').join('\n\n')
          : file.content.slice(0, 2000);
      }
    } 
    // For structured data files (CSV, Excel)
    else if (fileInfo.type === 'csv' || fileInfo.type === 'excel') {
      // Add sample data if provided
      if (file.sampleData) {
        fileInfo.sampleData = file.sampleData;
      }
      
      // Add column statistics if provided
      if (file.columnStats) {
        fileInfo.columnStats = file.columnStats;
      }
      
      // Basic metadata
      fileInfo.datasetMetadata = {
        total_rows: file.rowCount || 0,
        column_count: file.schema?.length || 0
      };
    }
    // For text files
    else if (fileInfo.type === 'text' || fileInfo.type === 'markdown') {
      if (file.content) {
        fileInfo.content = file.content;
        fileInfo.sample = file.content.slice(0, 2000);
      }
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