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
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Monitor request size
    const contentLength = request.headers.get('content-length');
    const requestSizeMB = contentLength ? parseInt(contentLength) / (1024 * 1024) : 0;
    
    logger.trace('[Unified] Request started', { 
      requestId,
      userId: 'pending',
      requestSizeMB: requestSizeMB.toFixed(2),
      contentLength,
      isLargePayload: requestSizeMB > 1,
      isCriticalSize: requestSizeMB > 3.5 // Near Vercel limit
    });
    
    // Warn if approaching Vercel limits
    if (requestSizeMB > 3.5) {
      logger.warn('[Unified] LARGE PAYLOAD WARNING', {
        requestId,
        sizeMB: requestSizeMB.toFixed(2),
        vercelLimit: '4.5MB',
        recommendation: 'Consider implementing compression or chunking'
      });
    }
    
    // Require authentication
    const user = await requireUser(request);
    logger.trace('[Unified] User authenticated', { requestId, userId: user.id });

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
    
    // Calculate actual payload size after parsing
    const payloadSize = JSON.stringify(body).length;
    const payloadSizeMB = payloadSize / (1024 * 1024);
    
    logger.trace('[Unified] Payload size analysis', {
      requestId,
      payloadSizeMB: payloadSizeMB.toFixed(2),
      payloadSizeKB: (payloadSize / 1024).toFixed(2),
      queryLength: query?.length || 0,
      filesCount: files?.length || 0,
      totalContentLength: files?.reduce((sum, f) => {
        const contentLength = typeof f.content === 'string' ? f.content.length :
                            Array.isArray(f.content) ? f.content.join('').length : 0;
        return sum + contentLength;
      }, 0) || 0,
      conversationHistoryCount: conversationHistory?.length || 0
    });

    logger.trace('[Unified] Request body parsed', {
      requestId,
      query,
      fileCount: files?.length || 0,
      pageId,
      workspaceId,
      hasConversationHistory: !!conversationHistory,
      firstFile: files?.[0] ? {
        filename: files[0].filename,
        hasData: !!files[0].data,
        hasContent: !!files[0].content,
        dataLength: files[0].data?.length || 0,
        contentLength: files[0].content?.length || 0,
        contentType: Array.isArray(files[0].content) ? 'array' : typeof files[0].content,
        sampleContent: Array.isArray(files[0].content) ? 
                      files[0].content[0]?.slice(0, 100) || 'No content' :
                      typeof files[0].content === 'string' ?
                      files[0].content.slice(0, 100) : 'No content',
        isContentEmpty: Array.isArray(files[0].content) ? 
                       files[0].content.length === 0 || files[0].content.every(c => !c || c.trim().length === 0) :
                       !files[0].content || (typeof files[0].content === 'string' && files[0].content.trim().length === 0)
      } : null
    });

    // CRITICAL DEBUG: Log detailed content for each file
    if (files && files.length > 0) {
      const contentValidation = files.map(file => {
        const contentLength = Array.isArray(file.content) ? 
          file.content.join('').length : 
          typeof file.content === 'string' ? file.content.length : 0;
        
        const hasActualContent = contentLength > 100 && 
          (Array.isArray(file.content) ? 
            file.content.some(c => c && c.trim().length > 50) :
            typeof file.content === 'string' && file.content.trim().length > 50);
        
        return {
          filename: file.filename,
          contentLength,
          hasActualContent,
          isEmpty: contentLength === 0
        };
      });
      
      const totalContentSize = contentValidation.reduce((sum, f) => sum + f.contentLength, 0);
      const filesWithContent = contentValidation.filter(f => f.hasActualContent).length;
      
      logger.trace('[Unified] CONTENT VALIDATION SUMMARY:', {
        requestId,
        totalContentSizeKB: (totalContentSize / 1024).toFixed(2),
        filesWithContent,
        totalFiles: files.length,
        emptyFiles: contentValidation.filter(f => f.isEmpty).length,
        validation: contentValidation
      });
      
      if (filesWithContent === 0) {
        logger.error('[Unified] CRITICAL: NO FILES HAVE ACTUAL CONTENT', {
          requestId,
          files: contentValidation
        });
      }
      
      logger.trace('[Unified] DETAILED FILE CONTENT DEBUG:', {
        requestId,
        totalFiles: files.length,
        files: files.map((file, index) => ({
          index,
          filename: file.filename,
          type: getFileType(file.filename),
          rawDataKeys: file.data ? Object.keys(file.data[0] || {}) : [],
          rawDataLength: Array.isArray(file.data) ? file.data.length : 0,
          rawContentType: typeof file.content,
          rawContentLength: Array.isArray(file.content) ? file.content.length : 
                           typeof file.content === 'string' ? file.content.length : 0,
          rawContentSample: Array.isArray(file.content) ? 
                           file.content.slice(0, 2).map(chunk => chunk?.slice(0, 200)).join('\n---\n') :
                           typeof file.content === 'string' ? file.content.slice(0, 500) : 
                           'NO CONTENT DETECTED',
          hasSchema: !!file.schema,
          rowCount: file.rowCount,
          pageCount: file.pageCount,
          chunkCount: file.chunkCount
        }))
      });
    }

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
    logger.trace('[Unified] Preparing file data...', { requestId });
    const fileDataStart = Date.now();
    const fileData = await prepareFileData(files, pageId, requestId);
    const fileDataTime = Date.now() - fileDataStart;
    
    logger.trace('[Unified] File data preparation completed', {
      requestId,
      preparationTimeMs: fileDataTime,
      preparedFiles: fileData.length
    });
    
    // CRITICAL DEBUG: Log prepared file data
    const preparedContentSize = fileData.reduce((sum, f) => {
      const size = typeof f.content === 'string' ? f.content.length :
                   Array.isArray(f.content) ? f.content.join('').length : 0;
      return sum + size;
    }, 0);
    
    logger.trace('[Unified] PREPARED FILE DATA DEBUG:', {
      requestId,
      totalPreparedSizeKB: (preparedContentSize / 1024).toFixed(2),
      preparedFiles: fileData.map(file => ({
        filename: file.filename,
        type: file.type,
        hasContent: !!file.content,
        contentType: typeof file.content,
        contentLength: typeof file.content === 'string' ? file.content.length : 
                      Array.isArray(file.content) ? file.content.join('').length : 0,
        contentSample: typeof file.content === 'string' ? file.content.slice(0, 500) :
                      Array.isArray(file.content) ? file.content.slice(0, 2).join('\n---\n').slice(0, 500) :
                      'NO PREPARED CONTENT',
        hasData: !!file.data,
        dataLength: Array.isArray(file.data) ? file.data.length : 0,
        hasExtractedContent: !!file.extractedContent,
        extractedContentLength: Array.isArray(file.extractedContent) ? file.extractedContent.length : 0,
        hasSample: !!file.sample,
        sampleLength: file.sample?.length || 0
      }))
    });
    
    // CRITICAL: Validate that we have actual content, not just metadata
    const contentValidation = fileData.map(file => ({
      filename: file.filename,
      type: file.type,
      hasContent: !!file.content,
      contentLength: typeof file.content === 'string' ? file.content.length : 
                     Array.isArray(file.content) ? file.content.join('').length : 0,
      hasData: !!file.data,
      dataLength: Array.isArray(file.data) ? file.data.length : 0,
      contentSample: typeof file.content === 'string' ? file.content.slice(0, 200) :
                     Array.isArray(file.content) ? file.content[0]?.slice(0, 200) : 'NO CONTENT'
    }));
    
    logger.trace('[Unified] Content validation results', {
      fileCount: fileData.length,
      validation: contentValidation,
      totalContentLength: contentValidation.reduce((acc, v) => acc + v.contentLength, 0),
      filesWithContent: contentValidation.filter(v => v.hasContent).length,
      filesWithData: contentValidation.filter(v => v.hasData).length
    });
    
    // Warn if no actual content was extracted
    if (contentValidation.every(v => v.contentLength === 0)) {
      logger.error('[Unified] CRITICAL: No content extracted from any file!', {
        fileData: fileData.map(f => ({ 
          filename: f.filename, 
          type: f.type,
          contentType: typeof f.content,
          dataType: typeof f.data 
        }))
      });
    }
    
    // Perform unified analysis using the correct method name: process
    logger.trace('[Unified] Starting unified analysis...', { requestId });
    const analysisStart = Date.now();
    let analysis;
    
    try {
      // CRITICAL DEBUG: Log what we're sending to the intelligence service
      logger.trace('[Unified] SENDING TO INTELLIGENCE SERVICE:', {
        queryLength: query.length,
        fileDataCount: fileData.length,
        fileDataSummary: fileData.map(f => ({
          filename: f.filename,
          type: f.type,
          hasContent: !!f.content,
          contentLength: typeof f.content === 'string' ? f.content.length : 
                        Array.isArray(f.content) ? f.content.join('').length : 0,
          actualContentSample: typeof f.content === 'string' ? f.content.slice(0, 300) :
                              Array.isArray(f.content) ? f.content.slice(0, 2).join('\\n').slice(0, 300) :
                              'NO CONTENT FOR INTELLIGENCE SERVICE'
        })),
        intentType: intent.queryType,
        intentFormat: intent.formatPreference,
        hasConversationHistory: conversationHistory && conversationHistory.length > 0
      });
      
      // Add request ID to track through the pipeline
      analysis = await intelligence.process({
        requestId,
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
      
      // CRITICAL DEBUG: Log what came back from the intelligence service
      logger.trace('[Unified] RECEIVED FROM INTELLIGENCE SERVICE:', {
        hasAnalysis: !!analysis,
        analysisKeys: analysis ? Object.keys(analysis) : [],
        hasSemantic: !!analysis?.semantic,
        semanticSummaryLength: analysis?.semantic?.summary?.length || 0,
        semanticSummaryPreview: analysis?.semantic?.summary?.slice(0, 200) || 'No summary',
        hasPresentation: !!analysis?.presentation,
        presentationNarrativeLength: analysis?.presentation?.narrative?.length || 0,
        confidence: analysis?.confidence
      });
      
      const analysisTime = Date.now() - analysisStart;
      logger.trace('[Unified] Analysis completed successfully', {
        requestId,
        analysisTimeMs: analysisTime,
        analysisTimeSec: (analysisTime / 1000).toFixed(2)
      });
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
      // CRITICAL DEBUG: Log what we're sending to the response composer
      logger.trace('[Unified] SENDING TO RESPONSE COMPOSER:', {
        hasAnalysis: !!analysis,
        analysisSemanticSummary: analysis?.semantic?.summary || 'No semantic summary',
        analysisPresentationNarrative: analysis?.presentation?.narrative || 'No presentation narrative',
        intentType: intent.queryType,
        intentFormat: intent.formatPreference,
        optionsProvided: {
          prioritizeNarrative: true,
          depth: intent.expectedDepth,
          includeTechnicalDetails: false
        }
      });
      
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
      
      // CRITICAL DEBUG: Log the composed response
      logger.trace('[Unified] RESPONSE COMPOSER OUTPUT:', {
        responseLength: response?.length || 0,
        responsePreview: response?.slice(0, 500) || 'No response generated',
        responseIsEmpty: !response || response.trim().length === 0,
        responseContainsActualContent: response && response.length > 50 && !response.includes('Unable to')
      });
      
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

    // Track token usage and performance
    const totalProcessingTime = Date.now() - startTime;
    
    const tokenMetadata = {
      model: 'gpt-4-turbo-preview',
      contextTokens: analysis?.metadata?.tokensUsed || 0,
      responseTokens: 0, // Will be set by OpenAI response
      totalTokens: analysis?.metadata?.tokensUsed || 0,
      intent: intent.formatPreference,
      confidence: intent.confidence,
      requestId,
      processingTimeMs: totalProcessingTime,
      payloadSizeMB: payloadSizeMB.toFixed(2),
      preparedContentSizeKB: (preparedContentSize / 1024).toFixed(2)
    };
    
    // Critical check: If no tokens were used, OpenAI was not called
    if (tokenMetadata.totalTokens === 0) {
      logger.error('[Unified] CRITICAL: OpenAI was not called or failed', {
        requestId,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        analysisHadContent: !!analysis?.semantic?.summary,
        responseLength: response?.length || 0
      });
    }

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
      requestId,
      responseLength: finalResponse.content.length,
      metadataKeys: Object.keys(finalResponse.metadata),
      totalProcessingTimeMs: totalProcessingTime,
      totalProcessingTimeSec: (totalProcessingTime / 1000).toFixed(2),
      isGenericResponse: finalResponse.content.includes('This The') || 
                        finalResponse.content.includes('Analyzing') ||
                        finalResponse.content.includes('Unable to extract')
    });
    
    // Log performance summary for monitoring
    logger.data('[Unified] Request completed', {
      requestId,
      userId: user.id,
      pageId,
      filesCount: files?.length || 0,
      queryLength: query?.length || 0,
      requestSizeMB: requestSizeMB.toFixed(2),
      responseLength: finalResponse.content.length,
      totalProcessingTimeMs: totalProcessingTime,
      contextTokens: tokenMetadata.contextTokens,
      totalTokens: tokenMetadata.totalTokens,
      success: true
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
async function prepareFileData(files: any[], pageId: string, requestId?: string) {
  const preparedFiles = [];
  
  logger.trace('[prepareFileData] Starting file preparation', {
    requestId,
    fileCount: files.length,
    pageId
  });
  
  for (const file of files) {
    const fileType = getFileType(file.filename);
    logger.trace('[prepareFileData] Processing file', {
      filename: file.filename,
      type: fileType,
      hasSchema: !!file.schema,
      rowCount: file.rowCount,
      hasContent: !!file.content,
      hasData: !!file.data,
      contentType: Array.isArray(file.content) ? 'array' : typeof file.content,
      dataLength: Array.isArray(file.data) ? file.data.length : 0,
      firstDataRow: file.data?.[0] ? Object.keys(file.data[0]) : null
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
      if (file.content && Array.isArray(file.content)) {
        // Content is an array of text chunks
        fileInfo.content = file.content.join('\n\n');
        fileInfo.extractedContent = file.content;
        fileInfo.sample = file.content.slice(0, 5).join('\n\n').slice(0, 2000);
        
        logger.trace('[prepareFileData] PDF content from chunks', {
          filename: file.filename,
          chunkCount: file.content.length,
          totalLength: fileInfo.content.length,
          sampleLength: fileInfo.sample.length,
          firstChunkSample: file.content[0]?.slice(0, 300) || 'Empty first chunk',
          lastChunkSample: file.content[file.content.length - 1]?.slice(0, 300) || 'Empty last chunk'
        });
        
        // CRITICAL: Log actual content being prepared
        logger.trace('[prepareFileData] ACTUAL PDF CONTENT BEING PREPARED:', {
          filename: file.filename,
          fullContentPreview: fileInfo.content.slice(0, 1000),
          contentStartsWith: fileInfo.content.slice(0, 100),
          contentEndsWithSample: fileInfo.content.slice(-100),
          isEmpty: fileInfo.content.trim().length === 0,
          wordCount: fileInfo.content.split(/\s+/).length
        });
      } else if (file.data && Array.isArray(file.data)) {
        // If data is provided (from DuckDB), extract text content
        const textContent = file.data
          .map((row: any) => row.text || row.content || '')
          .filter(Boolean);
        
        fileInfo.content = textContent.join('\n\n');
        fileInfo.data = file.data;
        fileInfo.extractedContent = textContent;
        fileInfo.sample = textContent.slice(0, 5).join('\n\n').slice(0, 2000);
        
        logger.trace('[prepareFileData] PDF content from data rows', {
          filename: file.filename,
          rowCount: file.data.length,
          textChunks: textContent.length,
          totalLength: fileInfo.content.length
        });
      } else if (typeof file.content === 'string') {
        // Content is already a string
        fileInfo.content = file.content;
        fileInfo.sample = file.content.slice(0, 2000);
      }
      
      logger.trace('[prepareFileData] PDF metadata prepared', {
        filename: file.filename,
        hasContent: !!fileInfo.content,
        contentLength: fileInfo.content?.length || 0,
        hasData: !!fileInfo.data,
        pageCount: fileInfo.documentMetadata.page_count
      });
    } 
    // For structured data files (CSV, Excel)
    else if (fileInfo.type === 'csv' || fileInfo.type === 'excel') {
      // Handle data from client (could be in data, sampleData, or content)
      if (file.data && Array.isArray(file.data)) {
        fileInfo.data = file.data;
        fileInfo.sampleData = file.data.slice(0, 100);
        
        // Generate content string for AI analysis
        if (file.data.length > 0) {
          const headers = Object.keys(file.data[0]);
          const rows = file.data.slice(0, 50).map(row => 
            headers.map(h => row[h]).join(', ')
          );
          fileInfo.content = headers.join(', ') + '\n' + rows.join('\n');
          fileInfo.sample = fileInfo.content.slice(0, 2000);
        }
        
        logger.trace('[prepareFileData] Structured data from data array', {
          filename: file.filename,
          rowCount: file.data.length,
          hasContent: !!fileInfo.content
        });
      } else if (file.sampleData) {
        fileInfo.sampleData = file.sampleData;
        fileInfo.data = file.sampleData;
      } else if (file.content) {
        // If content is provided as array or string
        fileInfo.content = Array.isArray(file.content) 
          ? file.content.join('\n') 
          : file.content;
        fileInfo.sample = fileInfo.content.slice(0, 2000);
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
        columnCount: fileInfo.datasetMetadata.column_count,
        hasContent: !!fileInfo.content,
        hasData: !!fileInfo.data,
        contentLength: fileInfo.content?.length || 0
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