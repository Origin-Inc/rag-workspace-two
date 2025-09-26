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
    logger.trace('[Unified] Request started', { userId: user.id });

    if (!isOpenAIConfigured()) {
      logger.warn('[Unified] OpenAI not configured');
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

    logger.trace('[Unified] Request body parsed', {
      query,
      fileCount: files?.length || 0,
      pageId,
      workspaceId,
      hasConversationHistory: !!conversationHistory
    });

    if (!query || !files || files.length === 0) {
      logger.warn('[Unified] Missing required fields', { query: !!query, files: !!files });
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
    logger.trace('[Unified] Query intent analyzed', {
      query,
      formatPreference: intent.formatPreference,
      queryType: intent.queryType,
      confidence: intent.confidence,
      needsDataAccess: queryIntentAnalyzer.needsDataAccess(intent)
    });

    // Initialize services with extensive logging
    logger.trace('[Unified] Initializing services...');
    
    let intelligence;
    let composer;
    
    try {
      intelligence = new UnifiedIntelligenceService();
      logger.trace('[Unified] UnifiedIntelligenceService instantiated');
      
      // Verify the process method exists
      if (typeof intelligence.process !== 'function') {
        logger.error('[Unified] process method not found on UnifiedIntelligenceService', {
          availableMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(intelligence))
        });
        throw new Error('UnifiedIntelligenceService.process method not found');
      }
      
      composer = new ResponseComposer();
      logger.trace('[Unified] ResponseComposer instantiated');
      
      // Verify the compose method exists
      if (typeof composer.compose !== 'function') {
        logger.error('[Unified] compose method not found on ResponseComposer', {
          availableMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(composer))
        });
        throw new Error('ResponseComposer.compose method not found');
      }
    } catch (serviceError) {
      logger.error('[Unified] Service instantiation failed', serviceError);
      throw serviceError;
    }

    // Prepare file data based on type
    logger.trace('[Unified] Preparing file data...');
    const fileData = await prepareFileData(files, pageId);
    logger.trace('[Unified] File data prepared', {
      fileCount: fileData.length,
      fileTypes: fileData.map(f => f.type)
    });
    
    // Perform unified analysis using the correct method name: process
    logger.trace('[Unified] Starting unified analysis...');
    let analysis;
    
    try {
      analysis = await intelligence.process({
        query,
        files: fileData,
        intent,
        conversationHistory: conversationHistory || [],
        options: {
          includeSQL: false,
          includeSemantic: true,
          includeInsights: true,
          includeStatistics: true,
          formatPreference: intent.formatPreference
        }
      });
      logger.trace('[Unified] Analysis completed successfully');
    } catch (analysisError) {
      logger.error('[Unified] Analysis failed', {
        error: analysisError,
        stack: analysisError instanceof Error ? analysisError.stack : undefined
      });
      throw new Error(`Analysis failed: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`);
    }

    logger.trace('[Unified] Analysis result structure', {
      hasAnalysis: !!analysis,
      hasSemantic: !!analysis?.semantic,
      hasStatistical: !!analysis?.statistical,
      hasPresentation: !!analysis?.presentation,
      keyThemesCount: analysis?.semantic?.keyThemes?.length || 0,
      patternsCount: analysis?.statistical?.patterns?.length || 0
    });

    // Compose natural response using correct parameter structure
    logger.trace('[Unified] Starting response composition...');
    let response;
    
    try {
      // ResponseComposer.compose expects: (intent, analysis, queryResult?, options?)
      response = await composer.compose(
        intent,
        analysis,
        null, // queryResult - we're not providing SQL results here
        {
          prioritizeNarrative: true,
          depth: intent.expectedDepth,
          includeTechnicalDetails: false
        }
      );
      logger.trace('[Unified] Response composed successfully', {
        responseLength: response?.length || 0
      });
    } catch (composeError) {
      logger.error('[Unified] Response composition failed', {
        error: composeError,
        stack: composeError instanceof Error ? composeError.stack : undefined
      });
      throw new Error(`Response composition failed: ${composeError instanceof Error ? composeError.message : 'Unknown error'}`);
    }

    // Track token usage
    const tokenMetadata = {
      model: 'gpt-4-turbo-preview',
      contextTokens: analysis?.metadata?.tokensUsed || 0,
      responseTokens: 0, // Will be set by OpenAI response
      totalTokens: analysis?.metadata?.tokensUsed || 0,
      intent: intent.formatPreference,
      confidence: intent.confidence
    };

    logger.trace('[Unified] Response ready', {
      contentLength: response?.length || 0,
      hasMetadata: !!analysis?.metadata,
      processingTime: analysis?.metadata?.processingTime
    });

    // Return the composed response
    const finalResponse = {
      content: response || 'Unable to generate response',
      metadata: {
        ...tokenMetadata,
        files: files.map((f: any) => f.filename),
        queryType: intent.queryType,
        formatPreference: intent.formatPreference,
        processingTime: analysis?.metadata?.processingTime,
        confidence: analysis?.confidence
      }
    };

    logger.trace('[Unified] Sending successful response', {
      responseLength: finalResponse.content.length,
      metadataKeys: Object.keys(finalResponse.metadata)
    });

    return json(finalResponse);

  } catch (error) {
    logger.error('[Unified] Request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      type: error instanceof Error ? error.constructor.name : typeof error
    });
    
    // Provide a helpful error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return json(
      {
        content: `I encountered an error while processing your request: ${errorMessage}\n\nPlease try rephrasing your query or ensure the files are properly loaded.`,
        metadata: { 
          error: errorMessage,
          stack: process.env.NODE_ENV === 'development' ? 
            (error instanceof Error ? error.stack : undefined) : undefined,
          timestamp: new Date().toISOString()
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
  
  logger.trace('[prepareFileData] Starting file preparation', {
    fileCount: files.length,
    pageId
  });
  
  for (const file of files) {
    const fileType = getFileType(file.filename);
    logger.trace('[prepareFileData] Processing file', {
      filename: file.filename,
      type: fileType,
      hasSchema: !!file.schema,
      rowCount: file.rowCount
    });
    
    const fileInfo: any = {
      id: file.id || file.filename,
      filename: file.filename,
      tableName: file.tableName,
      type: fileType,
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
      } else if (file.data) {
        // If data is provided (from DuckDB), use it
        fileInfo.data = file.data;
        fileInfo.extractedContent = file.data;
      }
      
      logger.trace('[prepareFileData] PDF metadata prepared', {
        filename: file.filename,
        hasContent: !!fileInfo.content,
        hasData: !!fileInfo.data,
        pageCount: fileInfo.documentMetadata.page_count
      });
    } 
    // For structured data files (CSV, Excel)
    else if (fileInfo.type === 'csv' || fileInfo.type === 'excel') {
      // Add sample data if provided
      if (file.sampleData) {
        fileInfo.sampleData = file.sampleData;
        fileInfo.data = file.sampleData;
      }
      
      // Add column statistics if provided
      if (file.columnStats) {
        fileInfo.columnStats = file.columnStats;
        fileInfo.metadata = { columnStats: file.columnStats };
      }
      
      // Basic metadata
      fileInfo.datasetMetadata = {
        total_rows: file.rowCount || 0,
        column_count: file.schema?.length || 0
      };
      
      logger.trace('[prepareFileData] Structured data prepared', {
        filename: file.filename,
        rowCount: fileInfo.datasetMetadata.total_rows,
        columnCount: fileInfo.datasetMetadata.column_count
      });
    }
    // For text files
    else if (fileInfo.type === 'text' || fileInfo.type === 'markdown') {
      if (file.content) {
        fileInfo.content = file.content;
        fileInfo.sample = file.content.slice(0, 2000);
        fileInfo.extractedContent = file.content;
      }
    }
    
    preparedFiles.push(fileInfo);
  }
  
  logger.trace('[prepareFileData] File preparation complete', {
    preparedCount: preparedFiles.length
  });
  
  return preparedFiles;
}

/**
 * Get file type from filename
 */
function getFileType(filename: string): 'pdf' | 'csv' | 'excel' | 'text' | 'markdown' | 'json' | 'xml' | 'unknown' {
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