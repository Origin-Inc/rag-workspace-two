import { json } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { eventStream } from "remix-utils/sse/server";
import { prisma } from "~/utils/prisma.server";
import { queryIntentAnalyzer } from "~/services/query-intent-analyzer.server";
import { UnifiedIntelligenceService } from "~/services/unified-intelligence.server";
import { ResponseComposer } from "~/services/response-composer.server";
import { ConversationContextManager } from "~/services/conversation-context.server";
import { createChatCompletion, isOpenAIConfigured } from "~/services/openai.server";
import { requireUser } from '~/services/auth/auth.server';
import { DebugLogger } from '~/utils/debug-logger';
import { aiModelConfig } from '~/services/ai-model-config.server';
import { QueryErrorRecovery } from '~/services/query-error-recovery.server';
import { FuzzyFileMatcher } from '~/services/fuzzy-file-matcher.server';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const logger = new DebugLogger('api.chat-query');

export const action: ActionFunction = async ({ request }) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Declare variables at top for error handler access
  let user: any;
  let query: string = '';
  let files: any[] = [];

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
    const authStart = Date.now();
    try {
      user = await requireUser(request);
      const authTime = Date.now() - authStart;
      logger.error('[TIMING] Authentication', { requestId, authTimeMs: authTime });
    } catch (authError) {
      logger.error('[Unified] Authentication failed', {
        requestId,
        error: authError instanceof Error ? authError.message : 'Unknown auth error',
        stack: authError instanceof Error ? authError.stack : undefined
      });
      throw authError;
    }

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

    const parseStart = Date.now();
    const body = await request.json();
    // Extract variables (already declared at top for error handler)
    query = body.query;
    files = body.files || [];
    const { pageId, workspaceId, conversationHistory, sessionId, queryResults, fileMetadata, stream } = body;
    const parseTime = Date.now() - parseStart;
    logger.error('[TIMING] Parse request body', { requestId, parseTimeMs: parseTime });

    // CRITICAL DEBUG: Log what client sent
    logger.error('[REQUEST DEBUG] ⚠️ Request body analysis', {
      requestId,
      query: query?.slice(0, 100),
      filesCount: files?.length || 0,
      files: files?.map(f => ({
        filename: f.filename,
        type: f.type,
        tableName: f.tableName,
        hasData: !!f.data,
        dataIsArray: Array.isArray(f.data),
        dataLength: Array.isArray(f.data) ? f.data.length : 0,
        hasContent: !!f.content,
        contentType: typeof f.content,
        contentLength: typeof f.content === 'string' ? f.content.length :
                      Array.isArray(f.content) ? f.content.length : 0,
        hasParquetUrl: !!f.parquetUrl,
        hasStorageUrl: !!f.storageUrl,
        firstDataRow: f.data?.[0] ? Object.keys(f.data[0]) : null
      })),
      hasQueryResults: !!queryResults,
      queryResultsData: queryResults?.data ? `${queryResults.data.length} rows` : 'none'
    });
    
    // Generate session ID if not provided
    const currentSessionId = sessionId || `session_${user.id}_${Date.now()}`;
    
    // Get or create conversation context
    const context = ConversationContextManager.getContext(
      currentSessionId,
      user.id,
      workspaceId,
      pageId
    );
    
    // Ensure conversationHistory is always an array
    const safeConversationHistory = Array.isArray(conversationHistory) ? conversationHistory : [];
    
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
                            Array.isArray(f.content) ? f.content.map((item: any) => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 0;
        return sum + contentLength;
      }, 0) || 0,
      conversationHistoryCount: safeConversationHistory.length
    });

    logger.trace('[Unified] Request body parsed', {
      requestId,
      query,
      fileCount: files?.length || 0,
      pageId,
      workspaceId,
      hasConversationHistory: safeConversationHistory.length > 0,
      firstFile: files?.[0] ? {
        filename: files[0].filename,
        hasData: !!files[0].data,
        hasContent: !!files[0].content,
        dataLength: files[0].data?.length || 0,
        contentLength: files[0].content?.length || 0,
        contentType: Array.isArray(files[0].content) ? 'array' : typeof files[0].content,
        sampleContent: Array.isArray(files[0].content) ? 
                      (files[0].content[0] ? 
                        (typeof files[0].content[0] === 'string' ? 
                          files[0].content[0].slice(0, 100) : 
                          JSON.stringify(files[0].content[0]).slice(0, 100)) : 'No content') :
                      typeof files[0].content === 'string' ?
                      files[0].content.slice(0, 100) : 
                      files[0].content ? JSON.stringify(files[0].content).slice(0, 100) : 'No content',
        isContentEmpty: Array.isArray(files[0].content) ? 
                       files[0].content.length === 0 || files[0].content.every(c => 
                         !c || (typeof c === 'string' ? c.trim().length === 0 : false)
                       ) :
                       !files[0].content || (typeof files[0].content === 'string' && files[0].content.trim().length === 0)
      } : null
    });

    // CRITICAL DEBUG: Log detailed content for each file
    if (files && files.length > 0) {
      const contentValidation = files.map(file => {
        const contentLength = Array.isArray(file.content) ? 
          file.content.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 
          typeof file.content === 'string' ? file.content.length : 0;
        
        const hasActualContent = contentLength > 100 && 
          (Array.isArray(file.content) ? 
            file.content.some(c => c && (typeof c === 'string' ? c.trim().length > 50 : true)) :
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
                           file.content.slice(0, 2).map((chunk: any) => 
                             chunk ? (typeof chunk === 'string' ? chunk.slice(0, 200) : JSON.stringify(chunk).slice(0, 200)) : 'Empty chunk'
                           ).join('\n---\n') :
                           typeof file.content === 'string' ? file.content.slice(0, 500) : 
                           'NO CONTENT DETECTED',
          hasSchema: !!file.schema,
          rowCount: file.rowCount,
          pageCount: file.pageCount,
          chunkCount: file.chunkCount
        }))
      });
    }

    if (!query || !files) {
      logger.warn('[Unified] Missing required fields', { query: !!query, files: !!files });
      return json(
        { 
          content: "Please provide a query.",
          metadata: { error: "Missing query or files parameter" }
        },
        { status: 400 }
      );
    }
    
    // Allow empty files array for general queries
    if (files.length === 0) {
      logger.trace('[Unified] Processing general query without files', { query });
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
    
    // Update context with query and intent
    ConversationContextManager.updateWithQuery(context, query, intent, files || []);

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
    logger.trace('[Unified] Preparing file data...', { requestId, hasQueryResults: !!queryResults });
    const fileDataStart = Date.now();

    // QUERY-FIRST INTEGRATION (Task 61.1):
    // If query results are provided, use them instead of preparing full files
    let fileData;
    let storedQueryResults = null; // Store for passing to ResponseComposer

    // CRITICAL DEBUG: Check what we received
    logger.error('[CRITICAL DEBUG] Data path selection', {
      requestId,
      hasQueryResults: !!queryResults,
      queryResultsKeys: queryResults ? Object.keys(queryResults) : [],
      queryResultsData: queryResults?.data ? `${queryResults.data.length} rows` : 'no data',
      hasFiles: !!files,
      filesCount: files?.length || 0,
      filesPreview: files?.slice(0, 2).map(f => ({
        filename: f.filename,
        hasData: !!f.data,
        dataLength: Array.isArray(f.data) ? f.data.length : 0,
        hasContent: !!f.content,
        contentType: typeof f.content,
        contentLength: typeof f.content === 'string' ? f.content.length :
                      Array.isArray(f.content) ? f.content.length : 0
      }))
    });

    if (queryResults && queryResults.data) {
      logger.error('[Query-First] ✅ USING QUERY-FIRST PATH', {
        requestId,
        resultRows: queryResults.data.length,
        sql: queryResults.sql,
        executionTime: queryResults.executionTime
      });

      fileData = prepareQueryResults(queryResults, fileMetadata, requestId);

      // CRITICAL FIX: Store query results for ResponseComposer
      storedQueryResults = {
        success: true,
        data: queryResults.data,
        sql: queryResults.sql,
        columns: queryResults.columns,
        rowCount: queryResults.rowCount,
        executionTime: queryResults.executionTime
      };
    } else {
      logger.error('[Traditional] ⚠️ USING TRADITIONAL PATH', {
        requestId,
        reason: !queryResults ? 'No queryResults' : 'No queryResults.data',
        filesCount: files?.length || 0
      });

      // PHASE 2: Intelligent file filtering with fuzzy matching (84% reduction)
      let filteredFiles = files;
      if (files && files.length > 1) {
        // Use fuzzy matcher to find best matching file
        const matches = FuzzyFileMatcher.matchFiles(query, files, {
          confidenceThreshold: 0.3,
          maxResults: 1,
          includeSemanticMatch: true,
          includeTemporalMatch: true,
        });

        if (matches.length > 0 && matches[0].confidence >= 0.3) {
          // Found a good match - use it
          filteredFiles = [matches[0].file];
          logger.trace('[File Filter] Fuzzy match found', {
            requestId,
            originalCount: files.length,
            filteredCount: 1,
            selectedFile: matches[0].file.filename,
            matchType: matches[0].matchType,
            confidence: matches[0].confidence.toFixed(2),
            matchedTokens: matches[0].matchedTokens,
            reason: matches[0].reason,
            reduction: `${((1 - 1/files.length) * 100).toFixed(0)}%`
          });
        } else {
          // No good match - use most recent file as fallback
          const latestFile = files[files.length - 1];
          filteredFiles = [latestFile];
          logger.trace('[File Filter] No fuzzy match, using latest file', {
            requestId,
            originalCount: files.length,
            filteredCount: 1,
            selectedFile: latestFile.filename,
            reduction: `${((1 - 1/files.length) * 100).toFixed(0)}%`
          });
        }
      }

      // Traditional file-based approach with filtered files
      fileData = await prepareFileData(filteredFiles, pageId, requestId);
    }

    const fileDataTime = Date.now() - fileDataStart;
    logger.error('[TIMING] Data preparation', { requestId, dataPreparationTimeMs: fileDataTime });

    logger.error('[Unified] ⚠️ File data preparation CRITICAL CHECKPOINT', {
      requestId,
      preparationTimeMs: fileDataTime,
      preparedFiles: fileData.length,
      approach: queryResults ? 'query-first' : 'traditional',
      firstFile: fileData[0] ? {
        filename: fileData[0].filename,
        type: fileData[0].type,
        hasContent: !!fileData[0].content,
        contentType: typeof fileData[0].content,
        contentPreview: typeof fileData[0].content === 'string' ?
          fileData[0].content.slice(0, 300) :
          Array.isArray(fileData[0].content) ?
            `Array with ${fileData[0].content.length} items` :
            'NO CONTENT',
        hasData: !!fileData[0].data,
        dataLength: Array.isArray(fileData[0].data) ? fileData[0].data.length : 0
      } : 'NO FILES PREPARED'
    });

    // CRITICAL DEBUG: Log prepared file data
    const preparedContentSize = fileData.reduce((sum, f) => {
      const size = typeof f.content === 'string' ? f.content.length :
                   Array.isArray(f.content) ? f.content.map((item: any) => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 0;
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
                      Array.isArray(file.content) ? file.content.map((item: any) => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 0,
        contentSample: typeof file.content === 'string' ? file.content.slice(0, 500) :
                      Array.isArray(file.content) ? file.content.slice(0, 2).map(item => 
                        typeof item === 'string' ? item : JSON.stringify(item)
                      ).join('\n---\n').slice(0, 500) :
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
                     Array.isArray(file.content) ? file.content.map((item: any) => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 0,
      hasData: !!file.data,
      dataLength: Array.isArray(file.data) ? file.data.length : 0,
      contentSample: typeof file.content === 'string' ? file.content.slice(0, 200) :
                     Array.isArray(file.content) && file.content[0] ? 
                       (typeof file.content[0] === 'string' ? file.content[0].slice(0, 200) : 
                        file.content[0] ? JSON.stringify(file.content[0]).slice(0, 200) : 'Empty item') : 'NO CONTENT'
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
                        Array.isArray(f.content) ? f.content.map((item: any) => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 0,
          actualContentSample: typeof f.content === 'string' ? f.content.slice(0, 300) :
                              Array.isArray(f.content) ? f.content.slice(0, 2).map(item =>
                                typeof item === 'string' ? item : JSON.stringify(item)
                              ).join('\\n').slice(0, 300) :
                              'NO CONTENT FOR INTELLIGENCE SERVICE'
        })),
        intentType: intent.queryType,
        intentFormat: intent.formatPreference,
        hasConversationHistory: safeConversationHistory.length > 0
      });
      
      // Add request ID to track through the pipeline
      analysis = await intelligence.process({
        requestId,
        query,
        files: fileData,
        intent,
        conversationHistory: safeConversationHistory,
        options: {
          includeSQL: true, // Enable SQL generation for data queries
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
      logger.error('[TIMING] UnifiedIntelligenceService.process()', {
        requestId,
        intelligenceTimeMs: analysisTime,
        intelligenceTimeSec: (analysisTime / 1000).toFixed(2)
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

    const composeStart = Date.now();
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
        storedQueryResults, // CRITICAL FIX: Pass query results from query-first path
        {
          prioritizeNarrative: true,
          depth: intent.expectedDepth,
          includeTechnicalDetails: false
        }
      );

      const composeTime = Date.now() - composeStart;
      logger.error('[TIMING] ResponseComposer.compose()', {
        requestId,
        composeTimeMs: composeTime,
        composeTimeSec: (composeTime / 1000).toFixed(2)
      });
      
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

    // Log comprehensive timing breakdown
    logger.error('[TIMING] ===== REQUEST TIMING BREAKDOWN =====', {
      requestId,
      totalProcessingTimeMs: totalProcessingTime,
      totalProcessingTimeSec: (totalProcessingTime / 1000).toFixed(2),
      approach: queryResults ? 'query-first' : 'traditional'
    });

    // Get the actual model being used
    const modelName = await aiModelConfig.getModelName(user.id);
    
    // Extract prompt and completion tokens if available
    const promptTokens = analysis?.metadata?.promptTokens || analysis?.metadata?.tokensUsed || 0;
    const completionTokens = analysis?.metadata?.completionTokens || 0;
    const totalTokens = analysis?.metadata?.totalTokens || analysis?.metadata?.tokensUsed || promptTokens + completionTokens;
    
    const tokenMetadata = {
      model: modelName,
      contextTokens: promptTokens,
      responseTokens: completionTokens,
      totalTokens: totalTokens,
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
    // Update context with response
    const responseType = files && files.length > 0 ? 'data-query' : 'general-chat';
    ConversationContextManager.updateWithResponse(
      context,
      finalResponse.content,
      responseType,
      totalProcessingTime,
      tokenMetadata?.totalTokens
    );
    
    logger.trace('[Unified] Request completed', {
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

    // Check if client requested streaming response
    if (stream) {
      const streamStart = Date.now();
      logger.trace('[Unified] Creating streaming response', { requestId });

      return eventStream(request.signal, function setup(send) {
        // Stream response word by word for immediate feedback
        const words = finalResponse.content.split(' ');
        let sentWords = 0;
        let firstTokenSent = false;

        const interval = setInterval(() => {
          if (!firstTokenSent && sentWords === 0) {
            const timeToFirstToken = Date.now() - streamStart;
            logger.error('[TIMING] Time to first token', {
              requestId,
              timeToFirstTokenMs: timeToFirstToken
            });
            firstTokenSent = true;
          }
          if (sentWords < words.length) {
            const chunk = words[sentWords] + (sentWords < words.length - 1 ? ' ' : '');
            send({
              event: 'token',
              data: JSON.stringify({ content: chunk })
            });
            sentWords++;
          } else {
            // Send metadata when done
            send({
              event: 'metadata',
              data: JSON.stringify({
                metadata: finalResponse.metadata,
                sessionId: currentSessionId
              })
            });
            send({
              event: 'done',
              data: JSON.stringify({})
            });
            clearInterval(interval);
          }
        }, 5); // 5ms between chunks for smooth streaming

        return () => {
          clearInterval(interval);
        };
      });
    }

    // Include session ID in response for client continuity (non-streaming fallback)
    return json({ ...finalResponse, sessionId: currentSessionId });

  } catch (error) {
    // Log error with context for monitoring
    QueryErrorRecovery.logError(error, {
      requestId,
      query: query || 'unknown',
      userId: user?.id,
      fileCount: files?.length || 0
    });

    // Generate user-friendly error response with recovery suggestions
    const errorResponse = QueryErrorRecovery.generateErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );

    // Determine HTTP status code based on error category
    const statusCode = errorResponse.metadata.category === 'authentication_error' ? 401 :
                      errorResponse.metadata.category === 'validation_error' ? 400 :
                      500;

    return json(
      {
        content: errorResponse.content,
        metadata: {
          ...errorResponse.metadata,
          stack: process.env.NODE_ENV === 'development' && error instanceof Error ?
            error.stack : undefined
        }
      },
      { status: statusCode }
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
      hasParquetUrl: !!file.parquetUrl,
      hasStorageUrl: !!file.storageUrl,
      contentType: Array.isArray(file.content) ? 'array' : typeof file.content,
      dataLength: Array.isArray(file.data) ? file.data.length : 0,
      firstDataRow: file.data?.[0] ? Object.keys(file.data[0]) : null
    });

    // If file doesn't have data/content but has a parquetUrl, fetch it
    if (!file.data && !file.content && file.parquetUrl) {
      try {
        logger.trace('[prepareFileData] Fetching file content from storage', {
          filename: file.filename,
          parquetUrl: file.parquetUrl
        });

        const response = await fetch(file.parquetUrl);
        if (response.ok) {
          const contentType = response.headers.get('content-type');

          if (contentType?.includes('application/json')) {
            const jsonData = await response.json();

            // PDF content stored as JSON
            if (jsonData.extractedContent) {
              file.content = jsonData.extractedContent;
              file.data = jsonData.data;
              logger.trace('[prepareFileData] Loaded PDF content from JSON', {
                filename: file.filename,
                chunkCount: jsonData.extractedContent?.length || 0
              });
            }
            // CSV/Excel data stored as JSON
            else if (jsonData.data && Array.isArray(jsonData.data)) {
              file.data = jsonData.data;
              file.schema = jsonData.schema;
              logger.trace('[prepareFileData] Loaded CSV/Excel data from JSON', {
                filename: file.filename,
                rowCount: jsonData.data.length
              });
            }
          } else {
            // For Parquet files, we'd need a Parquet reader
            // For now, log that we need to implement this
            logger.warn('[prepareFileData] Parquet reading not yet implemented', {
              filename: file.filename,
              contentType
            });
          }
        }
      } catch (error) {
        logger.error('[prepareFileData] Failed to fetch file content', {
          filename: file.filename,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
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
      if ((file.content && Array.isArray(file.content)) || (file.data && Array.isArray(file.data))) {
        // Content is an array of text chunks or data objects
        // Use file.data if file.content doesn't exist (for new PDF structure)
        const contentArray = Array.isArray(file.content) ? file.content : 
                           (file.data && Array.isArray(file.data) ? file.data.map((row: any) => row.text || JSON.stringify(row)) : []);
        fileInfo.content = contentArray.map((item: any) => 
          typeof item === 'string' ? item : JSON.stringify(item)
        ).join('\n\n');
        fileInfo.extractedContent = contentArray;
        fileInfo.sample = contentArray.slice(0, 5).map((item: any) =>
          typeof item === 'string' ? item : JSON.stringify(item)
        ).join('\n\n').slice(0, 2000);
        
        logger.trace('[prepareFileData] PDF content from chunks', {
          filename: file.filename,
          chunkCount: contentArray.length,
          totalLength: fileInfo.content.length,
          sampleLength: fileInfo.sample.length,
          firstChunkSample: contentArray[0]?.slice(0, 300) || 'Empty first chunk',
          lastChunkSample: contentArray[contentArray.length - 1]?.slice(0, 300) || 'Empty last chunk'
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
        // Check multiple possible column names for PDF text content
        const textContent = file.data
          .map((row: any) => {
            // Try various column names that might contain the PDF text
            return row.text || row.content || row.chunk_text || row.chunk || 
                   row.text_content || row.page_content || row.page_text || '';
          })
          .filter(Boolean);
        
        // Log what columns are actually available for debugging
        if (file.data.length > 0) {
          logger.trace('[prepareFileData] PDF data columns available', {
            filename: file.filename,
            columns: Object.keys(file.data[0]),
            sampleRow: file.data[0]
          });
        }
        
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
      // CRITICAL DEBUG: Log incoming CSV data structure
      logger.debug('[prepareFileData] CSV/Excel processing START', {
        filename: file.filename,
        hasData: !!file.data,
        dataType: typeof file.data,
        dataIsArray: Array.isArray(file.data),
        dataLength: Array.isArray(file.data) ? file.data.length : 0,
        hasContent: !!file.content,
        contentType: typeof file.content,
        hasSampleData: !!file.sampleData,
        firstDataRow: file.data?.[0] ? Object.keys(file.data[0]).slice(0, 5) : null
      });
      
      // Handle data from client (could be in data, sampleData, or content)
      if (file.data && Array.isArray(file.data)) {
        fileInfo.data = file.data;
        fileInfo.sampleData = file.data.slice(0, 100);

        // Generate content string for AI analysis
        if (file.data.length > 0) {
          const headers = Object.keys(file.data[0]);
          const rows = file.data.slice(0, 50).map((row: any) =>
            headers.map(h => row[h]).join(', ')
          );
          fileInfo.content = headers.join(', ') + '\n' + rows.join('\n');
          fileInfo.sample = fileInfo.content.slice(0, 2000);

          // CRITICAL: Log the generated content
          logger.error('[prepareFileData] ✅ CSV CONTENT GENERATED', {
            filename: file.filename,
            headers: headers.length,
            headersList: headers,
            totalRows: file.data.length,
            rowsIncluded: rows.length,
            contentLength: fileInfo.content.length,
            contentPreview: fileInfo.content.slice(0, 500),
            sampleLength: fileInfo.sample.length,
            firstDataRow: file.data[0],
            lastDataRow: file.data[file.data.length - 1]
          });
        } else {
          logger.error('[prepareFileData] ⚠️ CSV HAS EMPTY DATA ARRAY', {
            filename: file.filename,
            dataLength: file.data.length
          });
        }
        
        logger.debug('[prepareFileData] Structured data from data array', {
          filename: file.filename,
          rowCount: file.data.length,
          hasContent: !!fileInfo.content,
          contentLength: fileInfo.content?.length || 0
        });
      } else if (file.sampleData) {
        fileInfo.sampleData = file.sampleData;
        fileInfo.data = file.sampleData;
        logger.debug('[prepareFileData] Using sampleData field', {
          filename: file.filename,
          sampleDataLength: Array.isArray(file.sampleData) ? file.sampleData.length : 0
        });
      } else if (file.content) {
        // If content is provided as array or string
        logger.debug('[prepareFileData] CSV using content field directly', {
          filename: file.filename,
          contentType: typeof file.content,
          contentIsArray: Array.isArray(file.content),
          contentLength: Array.isArray(file.content) ? file.content.length : 
                        typeof file.content === 'string' ? file.content.length : 0
        });
        
        fileInfo.content = Array.isArray(file.content) 
          ? file.content.map((item: any) => 
              typeof item === 'string' ? item : JSON.stringify(item)
            ).join('\n') 
          : file.content;
        fileInfo.sample = fileInfo.content.slice(0, 2000);
        
        logger.debug('[prepareFileData] CSV content processed', {
          filename: file.filename,
          processedContentLength: fileInfo.content.length,
          samplePreview: fileInfo.sample.slice(0, 200)
        });
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
      
      // CRITICAL FINAL CHECK: What are we actually sending?
      logger.debug('[prepareFileData] CSV FINAL PREPARED STATE', {
        filename: file.filename,
        rowCount: fileInfo.datasetMetadata.total_rows,
        columnCount: fileInfo.datasetMetadata.column_count,
        hasContent: !!fileInfo.content,
        contentType: typeof fileInfo.content,
        contentLength: fileInfo.content?.length || 0,
        hasData: !!fileInfo.data,
        dataLength: Array.isArray(fileInfo.data) ? fileInfo.data.length : 0,
        actualContentPreview: fileInfo.content ? fileInfo.content.slice(0, 500) : 'NO CONTENT SET',
        willBeSentToAI: !!fileInfo.content && fileInfo.content.length > 0
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
  
  // CRITICAL: Final validation of all prepared files
  logger.debug('[prepareFileData] FINAL VALIDATION - All files prepared', {
    preparedCount: preparedFiles.length,
    filesWithContent: preparedFiles.filter((f: any) => f.content && f.content.length > 0).length,
    filesWithoutContent: preparedFiles.filter((f: any) => !f.content || f.content.length === 0).length,
    preparedFilesSummary: preparedFiles.map((f: any) => ({
      filename: f.filename,
      type: f.type,
      hasContent: !!f.content,
      contentLength: f.content?.length || 0,
      hasData: !!f.data
    }))
  });
  
  return preparedFiles;
}

/**
 * Prepare query results for AI analysis (Query-First approach - Task 61.1)
 *
 * Instead of sending full datasets, we send SQL query results.
 * This reduces payload from megabytes to kilobytes.
 */
function prepareQueryResults(
  queryResults: {
    data: any[];
    sql?: string;
    columns?: string[];
    rowCount?: number;
    executionTime?: number;
  },
  fileMetadata?: Array<{
    filename: string;
    type: string;
    rowCount?: number;
    schema?: any[];
  }>,
  requestId?: string
): any[] {
  logger.trace('[prepareQueryResults] START', {
    requestId,
    resultRows: queryResults.data?.length || 0,
    columns: queryResults.columns?.length || 0,
    sql: queryResults.sql?.slice(0, 200),
    hasMetadata: !!fileMetadata
  });

  const results = queryResults.data || [];

  if (results.length === 0) {
    logger.warn('[prepareQueryResults] No results data provided', { requestId });
    return [];
  }

  // Format results as a readable text table
  const headers = queryResults.columns || Object.keys(results[0] || {});

  // Create CSV-like content for AI to analyze
  let content = `SQL Query:\n${queryResults.sql || 'Not provided'}\n\n`;
  content += `Execution Time: ${queryResults.executionTime || 0}ms\n`;
  content += `Total Rows: ${queryResults.rowCount || results.length}\n`;
  content += `Showing: Top ${results.length} rows\n\n`;
  content += `Results:\n`;
  content += `${headers.join(' | ')}\n`;
  content += `${headers.map(() => '---').join(' | ')}\n`;

  results.forEach((row, idx) => {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return val.toFixed(2);
      return String(val).slice(0, 50); // Truncate long strings
    });
    content += `${values.join(' | ')}\n`;
  });

  // Add file context if provided
  let fileContext = '\n\nSource Files:\n';
  if (fileMetadata && fileMetadata.length > 0) {
    fileMetadata.forEach(meta => {
      fileContext += `- ${meta.filename} (${meta.type}, ${meta.rowCount || 0} rows)\n`;
    });
  }

  const preparedFile = {
    id: 'query_results',
    filename: 'Query Results',
    type: 'csv',
    content: content + fileContext,
    data: results,
    schema: headers.map((h: string) => ({
      name: h,
      type: typeof results[0][h] === 'number' ? 'number' : 'text'
    })),
    rowCount: results.length,
    metadata: {
      sql: queryResults.sql,
      executionTime: queryResults.executionTime,
      totalRows: queryResults.rowCount,
      isQueryResult: true
    }
  };

  logger.trace('[prepareQueryResults] COMPLETE', {
    requestId,
    contentLength: content.length,
    contentPreview: content.slice(0, 500),
    headers: headers.length,
    rowsFormatted: results.length
  });

  return [preparedFile];
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