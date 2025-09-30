/**
 * Unified Intelligence Service
 * Provides multi-dimensional analysis combining semantic understanding,
 * statistical analysis, and natural presentation for any content type
 */

import { openai } from './openai.server';
import type { QueryIntent } from './query-intent-analyzer.server';
import { DebugLogger } from '~/utils/debug-logger';
import { aiModelConfig } from './ai-model-config.server';
import { costTracker } from './cost-tracker-simple.server';
// import { cacheManager } from './cache-manager.server';

const logger = new DebugLogger('unified-intelligence');

export interface FileContext {
  id: string;
  filename: string;
  type: 'csv' | 'excel' | 'pdf' | 'unknown';
  schema?: any;
  rowCount?: number;
  data?: any[];
  metadata?: Record<string, any>;
  extractedContent?: any; // For PDFs
}

export interface SemanticAnalysis {
  summary: string;
  context: string;
  keyThemes: string[];
  entities: string[];
  relationships: string[];
}

export interface StatisticalAnalysis {
  metrics: Record<string, any>;
  aggregations: any[];
  distributions: any[];
  patterns: string[];
  outliers: any[];
}

export interface PresentationLayer {
  narrative: string;
  tables: TableData[];
  insights: string[];
  recommendations: string[];
  visualizationSuggestions: string[];
}

export interface TableData {
  title: string;
  headers: string[];
  rows: any[][];
  caption?: string;
}

export interface UnifiedResponse {
  semantic: SemanticAnalysis;
  statistical: StatisticalAnalysis;
  presentation: PresentationLayer;
  sql?: string;
  confidence: number;
  responseType: 'full' | 'table-only' | 'narrative-only' | 'specific-answer';
  metadata: {
    tokensUsed: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    processingTime: number;
    filesAnalyzed: string[];
  };
}

export interface ProcessOptions {
  includeSQL: boolean;
  includeSemantic: boolean;
  includeInsights: boolean;
  includeStatistics: boolean;
  formatPreference?: string;
  maxTokens?: number;
}

export class UnifiedIntelligenceService {
  /**
   * Process query with unified intelligence
   */
  public async process(params: {
    requestId?: string;
    query: string;
    files: FileContext[];
    intent: QueryIntent;
    conversationHistory?: Array<{ role: string; content: string }>;
    options?: ProcessOptions;
  }): Promise<UnifiedResponse> {
    const startTime = Date.now();
    
    logger.trace('[UnifiedIntelligence] process() called', {
      requestId: params?.requestId,
      hasParams: !!params,
      paramsKeys: params ? Object.keys(params) : []
    });
    
    const { requestId, query, files, intent, conversationHistory = [], options = {} } = params;
    
    logger.trace('[UnifiedIntelligence] Processing query with unified intelligence', {
      requestId,
      query,
      fileCount: files.length,
      fileTypes: files.map(f => f.type),
      fileNames: files.map(f => f.filename),
      intent: intent.queryType,
      format: intent.formatPreference,
      hasOptions: !!options,
      optionKeys: Object.keys(options),
      hasOpenAI: !!openai,
      openAIConfigured: !!process.env.OPENAI_API_KEY
    });

    // Track token usage across all operations
    let totalTokensUsed = 0;

    // Step 1: Perform semantic analysis
    logger.trace('[UnifiedIntelligence] Starting semantic analysis...', { requestId });
    const semanticResult = await this.performSemanticAnalysisWithTokens(query, files, intent, requestId, conversationHistory);
    const semantic = semanticResult.analysis;
    totalTokensUsed += semanticResult.tokensUsed;
    
    logger.trace('[UnifiedIntelligence] Semantic analysis complete', {
      hasSummary: !!semantic.summary,
      keyThemesCount: semantic.keyThemes?.length || 0,
      entitiesCount: semantic.entities?.length || 0,
      tokensUsed: semanticResult.tokensUsed
    });
    
    // Step 2: Perform statistical analysis if needed
    logger.trace('[UnifiedIntelligence] Checking statistical analysis need', {
      needsDataAccess: intent.needsDataAccess
    });
    const statistical = intent.needsDataAccess 
      ? await this.performStatisticalAnalysis(query, files, intent)
      : this.getEmptyStatisticalAnalysis();
    logger.trace('[UnifiedIntelligence] Statistical analysis complete', {
      hasMetrics: !!statistical.metrics,
      patternsCount: statistical.patterns?.length || 0
    });
    
    // Step 3: Generate SQL if requested and applicable
    const shouldGenSQL = options.includeSQL && this.shouldGenerateSQL(intent, files);
    logger.trace('[UnifiedIntelligence] SQL generation check', {
      includeSQL: options.includeSQL,
      shouldGenerate: shouldGenSQL
    });
    const sql = shouldGenSQL
      ? await this.generateContextAwareSQL(query, files, semantic)
      : undefined;
    
    // Step 4: Compose presentation layer
    logger.trace('[UnifiedIntelligence] Composing presentation layer...');
    const presentation = await this.composePresentationLayer(
      query,
      semantic,
      statistical,
      intent,
      files
    );
    logger.trace('[UnifiedIntelligence] Presentation layer complete', {
      narrativeLength: presentation.narrative?.length || 0,
      tablesCount: presentation.tables?.length || 0
    });
    
    // Step 5: Calculate confidence
    const confidence = this.calculateResponseConfidence(semantic, statistical, intent);
    logger.trace('[UnifiedIntelligence] Confidence calculated', { confidence });
    
    const processingTime = Date.now() - startTime;
    
    const response = {
      semantic,
      statistical,
      presentation,
      sql,
      confidence,
      responseType: intent.formatPreference as any,
      metadata: {
        tokensUsed: totalTokensUsed,
        promptTokens: this.lastPromptTokens,
        completionTokens: this.lastCompletionTokens,
        totalTokens: totalTokensUsed,
        processingTime,
        filesAnalyzed: files.map(f => f.filename)
      }
    };
    
    logger.trace('[UnifiedIntelligence] Response complete', {
      processingTime,
      responseType: response.responseType,
      hasSemanticSummary: !!response.semantic?.summary,
      hasPresentationNarrative: !!response.presentation?.narrative
    });
    
    return response;
  }

  /**
   * Wrapper for semantic analysis that tracks tokens
   */
  private async performSemanticAnalysisWithTokens(
    query: string,
    files: FileContext[],
    intent: QueryIntent,
    requestId?: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<{ analysis: SemanticAnalysis; tokensUsed: number }> {
    const analysis = await this.performSemanticAnalysis(query, files, intent, requestId, conversationHistory);
    // Token count will be set by performSemanticAnalysis
    return { 
      analysis, 
      tokensUsed: this.lastTokensUsed || 0 
    };
  }

  private lastTokensUsed = 0;
  private lastPromptTokens = 0;
  private lastCompletionTokens = 0;

  /**
   * Perform semantic analysis on content
   */
  private async performSemanticAnalysis(
    query: string,
    files: FileContext[],
    intent: QueryIntent,
    requestId?: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<SemanticAnalysis> {
    // CRITICAL LOGGING: Track exactly what data we receive
    logger.trace('[performSemanticAnalysis] INPUT FILES DEBUG', {
      requestId,
      filesCount: files.length,
      files: files.map(f => ({
        filename: f.filename,
        type: f.type,
        hasContent: !!f.content,
        contentType: typeof f.content,
        contentIsArray: Array.isArray(f.content),
        contentLength: Array.isArray(f.content) ? f.content.length :
                      typeof f.content === 'string' ? f.content.length : 0,
        firstItemType: Array.isArray(f.content) && f.content[0] ? typeof f.content[0] : 'no-items',
        firstItemSample: Array.isArray(f.content) && f.content[0] ? 
                        (typeof f.content[0] === 'object' ? JSON.stringify(f.content[0]).slice(0, 100) : 
                         String(f.content[0]).slice(0, 100)) : 'no-content',
        hasData: !!f.data,
        dataLength: Array.isArray(f.data) ? f.data.length : 0
      }))
    });
    
    // Build context from files
    const fileDescriptions = files.map(f => this.describeFile(f)).join('\n');
    
    // CRITICAL: Log the actual content being analyzed
    logger.trace('[performSemanticAnalysis] AFTER DESCRIBE_FILE', {
      requestId,
      query,
      filesCount: files.length,
      contentLength: fileDescriptions.length,
      hasOpenAI: !!openai,
      openAIKey: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      openAIKeyLength: process.env.OPENAI_API_KEY?.length || 0,
      firstFile: files[0]?.filename,
      sampleContent: fileDescriptions.slice(0, 500),
      isContentEmpty: fileDescriptions.trim().length === 0,
      containsColumns: fileDescriptions.includes('Columns:'),
      containsRows: fileDescriptions.includes('Row 1:')
    });
    
    // CRITICAL DEBUG: Log what's actually being sent to OpenAI
    logger.trace('[performSemanticAnalysis] CONTENT BEING SENT TO OPENAI:', {
      requestId,
      totalContentLength: fileDescriptions.length,
      fileCount: files.length,
      actualContent: fileDescriptions.slice(0, 2000), // First 2000 chars
      contentIsEmpty: fileDescriptions.trim().length === 0,
      containsActualText: /[a-zA-Z]{10,}/.test(fileDescriptions), // Has actual words
      hasNumbers: /\d+/.test(fileDescriptions),
      linesCount: fileDescriptions.split('\n').length,
      files: files.map(f => ({
        filename: f.filename,
        type: f.type,
        hasRawContent: !!f.content,
        rawContentType: typeof f.content,
        rawContentLength: typeof f.content === 'string' ? f.content.length : 
                         Array.isArray(f.content) ? f.content.length : 0,
        processedByDescribeFile: this.describeFile(f).length
      }))
    });
    
    // CRITICAL FIX: Restructured prompt to avoid "lost in middle" phenomenon
    const prompt = `
You are analyzing a document. Your task is to find and extract SPECIFIC information about: "${query}"

IMPORTANT: Only use the document content below. Do not use any general knowledge.

DOCUMENT CONTENT:
${fileDescriptions}

END OF DOCUMENT CONTENT

Based ONLY on the document above, answer this query: "${query}"

Rules:
- Quote directly from the document when possible
- If the query asks about something not in the document, say "This information is not found in the provided document"
- Focus on extracting specific facts, not generalizing
- Include page/section references if available

Format as JSON with keys: summary (specific answer to the query), context (where in document this was found), keyThemes (only themes directly related to the query), entities (specific names/terms from document), relationships (how elements connect)
`;

    // CRITICAL DEBUG: Log the exact prompt being sent to OpenAI
    logger.trace('[performSemanticAnalysis] EXACT PROMPT TO OPENAI:', {
      requestId,
      promptLength: prompt.length,
      promptPreview: prompt.slice(0, 1000),
      promptContainsActualContent: prompt.includes(fileDescriptions) && fileDescriptions.trim().length > 0,
      queryInPrompt: prompt.includes(query),
      contentSectionLength: fileDescriptions.length,
      promptWordCount: prompt.split(/\s+/).length
    });

    try {
      // CRITICAL LOGGING: Check OpenAI availability
      logger.trace('[performSemanticAnalysis] OPENAI CHECK', {
        requestId,
        openaiExists: !!openai,
        openaiType: typeof openai,
        hasApiKey: !!process.env.OPENAI_API_KEY,
        apiKeyLength: process.env.OPENAI_API_KEY?.length || 0,
        apiKeyPrefix: process.env.OPENAI_API_KEY?.slice(0, 7) || 'no-key',
        nodeEnv: process.env.NODE_ENV
      });
      
      if (!openai) {
        logger.warn('[performSemanticAnalysis] OpenAI not configured, using content-based fallback', {
          requestId,
          hasApiKey: !!process.env.OPENAI_API_KEY,
          reason: 'OpenAI client not initialized',
          fallbackReason: 'NO_OPENAI_CLIENT'
        });
        this.lastTokensUsed = 0;
        return this.performContentBasedAnalysis(query, files, requestId);
      }
      
      // Verify we have actual content to send
      const trimmedLength = fileDescriptions.trim().length;
      logger.trace('[performSemanticAnalysis] CONTENT LENGTH CHECK', {
        requestId,
        rawLength: fileDescriptions.length,
        trimmedLength,
        threshold: 10,
        willUseFallback: trimmedLength < 10,
        first200Chars: fileDescriptions.slice(0, 200),
        last100Chars: fileDescriptions.slice(-100)
      });
      
      // CRITICAL FIX: Changed threshold from 10 to 0 to ensure we always try OpenAI if content exists
      if (trimmedLength === 0) {
        logger.error('[performSemanticAnalysis] ABSOLUTELY NO CONTENT to analyze', {
          requestId,
          contentLength: trimmedLength,
          actualContent: fileDescriptions,
          files: files.map(f => ({ 
            filename: f.filename, 
            hasContent: !!f.content,
            contentType: typeof f.content,
            dataLength: Array.isArray(f.data) ? f.data.length : 0
          })),
          fallbackReason: 'NO_CONTENT_AT_ALL'
        });
        this.lastTokensUsed = 0;
        return this.performContentBasedAnalysis(query, files, requestId);
      }
      
      // CRITICAL: Log that we're proceeding with OpenAI
      logger.trace('[performSemanticAnalysis] PROCEEDING WITH OPENAI CALL', {
        requestId,
        contentLength: trimmedLength,
        willCallOpenAI: true,
        hasOpenAIClient: !!openai
      });

      // Cache functionality temporarily disabled during migration
      // Will be re-enabled once Redis connection is stable

      // Get optimal model for this query type
      const queryComplexity = query.length > 200 || files.length > 1 ? 'complex' : 'simple';
      const modelName = await aiModelConfig.getModelName(requestId);
      
      // Build messages array with conversation history if available
      const messages: any[] = [
        { role: 'system', content: 'You are a document analysis system. CRITICAL: Only answer based on the provided document content. Never use general knowledge. If information is not in the document, explicitly state that. Always quote or reference specific parts of the document. Consider the conversation history for context when relevant.' }
      ];
      
      // Add conversation history if available (limit to last 5 exchanges to avoid token limits)
      if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-10); // Last 5 exchanges (user + assistant)
        messages.push(...recentHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content.substring(0, 500) // Truncate long messages
        })));
      }
      
      // Add the current user query with document content
      messages.push({ role: 'user', content: prompt });
      
      logger.trace('[performSemanticAnalysis] Calling OpenAI API', {
        requestId,
        promptLength: prompt.length,
        model: modelName,
        queryComplexity,
        messageCount: messages.length,
        userMessageLength: prompt.length,
        hasActualContent: fileDescriptions.trim().length > 0,
        hasConversationHistory: !!conversationHistory && conversationHistory.length > 0,
        conversationHistoryLength: conversationHistory?.length || 0
      });

      // Build API parameters with model config
      const apiParams = aiModelConfig.buildAPIParameters({
        messages,
        jsonResponse: true,
        jsonSchema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            context: { type: 'string' },
            keyThemes: { type: 'array', items: { type: 'string' } },
            entities: { type: 'array', items: { type: 'string' } },
            relationships: { type: 'array', items: { type: 'string' } }
          },
          required: ['summary']
        },
        queryType: queryComplexity === 'complex' ? 'complex' : 'simple'
      });

      // Add retry logic for transient failures
      let completion;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          logger.trace('[performSemanticAnalysis] ATTEMPTING OPENAI API CALL', {
            requestId,
            attemptNumber: retryCount + 1,
            maxRetries,
            model: apiParams.model,
            messagesCount: apiParams.messages.length,
            systemMessageLength: apiParams.messages[0].content.length,
            userMessageLength: apiParams.messages[1].content.length,
            totalPromptLength: apiParams.messages.reduce((sum, m) => sum + m.content.length, 0)
          });
          
          // CRITICAL: Log immediately before API call
          logger.trace('[performSemanticAnalysis] CALLING OPENAI NOW', {
            requestId,
            timestamp: new Date().toISOString(),
            model: apiParams.model
          });
          
          completion = await openai.chat.completions.create(apiParams);
          
          // CRITICAL: Log immediately after successful API call
          logger.trace('[performSemanticAnalysis] OPENAI CALL COMPLETED', {
            requestId,
            timestamp: new Date().toISOString(),
            hasCompletion: !!completion,
            hasUsage: !!completion?.usage
          });
          
          logger.trace('[performSemanticAnalysis] OPENAI API SUCCESS', {
            requestId,
            promptTokens: completion.usage?.prompt_tokens || 0,
            completionTokens: completion.usage?.completion_tokens || 0,
            totalTokens: completion.usage?.total_tokens || 0,
            finishReason: completion.choices?.[0]?.finish_reason,
            responseLength: completion.choices?.[0]?.message?.content?.length || 0
          });
          
          // Success - break out of retry loop
          break;
          
        } catch (openAIError) {
          retryCount++;
          
          logger.error('[performSemanticAnalysis] OPENAI API CALL FAILED', {
            requestId,
            retryCount,
            maxRetries,
            error: openAIError instanceof Error ? openAIError.message : 'Unknown error',
            isRateLimit: openAIError instanceof Error && openAIError.message.includes('rate'),
            isTimeout: openAIError instanceof Error && openAIError.message.includes('timeout')
          });
          
          if (retryCount > maxRetries) {
            throw openAIError; // Re-throw after max retries
          }
          
          // Wait before retrying (exponential backoff)
          const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 5000);
          logger.trace('[performSemanticAnalysis] Waiting before retry', {
            requestId,
            waitTimeMs: waitTime
          });
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
      
      if (!completion) {
        throw new Error('Failed to get completion from OpenAI after retries');
      }

      const rawResponse = completion.choices[0]?.message?.content || '{}';
      const result = JSON.parse(rawResponse);
      
      // Track token usage and cost
      this.lastTokensUsed = completion.usage?.total_tokens || 0;
      this.lastPromptTokens = completion.usage?.prompt_tokens || 0;
      this.lastCompletionTokens = completion.usage?.completion_tokens || 0;
      const cost = await costTracker.trackUsage(completion, modelName, requestId);
      
      // CRITICAL: Log token tracking
      logger.trace('[performSemanticAnalysis] TOKEN TRACKING', {
        requestId,
        lastTokensUsed: this.lastTokensUsed,
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
        cost,
        modelUsed: modelName
      });
      
      logger.trace('[performSemanticAnalysis] OpenAI response received', {
        cost,
        requestId,
        hasResult: !!result,
        hasSummary: !!result.summary,
        summaryLength: result.summary?.length || 0,
        keyThemesCount: result.keyThemes?.length || 0,
        isGenericSummary: result.summary?.includes('Analyzing') || result.summary?.includes('file(s)'),
        rawResponseLength: rawResponse.length,
        rawResponsePreview: rawResponse.slice(0, 500),
        completionTokens: completion.usage?.completion_tokens || 0,
        promptTokens: completion.usage?.prompt_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
        finishReason: completion.choices[0]?.finish_reason
      });
      
      // CRITICAL: Log the actual AI response content
      logger.trace('[performSemanticAnalysis] AI RESPONSE CONTENT:', {
        requestId,
        summary: result.summary,
        context: result.context,
        keyThemes: result.keyThemes,
        entities: result.entities,
        relationships: result.relationships,
        responseIsEmpty: !result.summary || result.summary.trim().length === 0,
        responseIsGeneric: result.summary?.includes('file(s)') || result.summary?.includes('Analyzing'),
        hasSpecificContent: result.summary && result.summary.length > 50 && 
                           !result.summary.includes('file(s)') && 
                           !result.summary.includes('Analyzing')
      });
      
      // Ensure arrays are properly formatted
      const ensureArray = (value: any): string[] => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') return [value];
        if (typeof value === 'object' && value !== null) {
          // If it's an object, try to extract values
          return Object.values(value).filter(v => typeof v === 'string');
        }
        return [];
      };
      
      // Check if the response is generic or actually contains meaningful analysis
      const isGenericResponse = result.summary && (
        result.summary.includes('Analyzing') || 
        result.summary.includes('file(s)') ||
        result.summary.includes('Content analysis unavailable') ||
        result.summary.length < 50
      );
      
      // If response is generic, try to extract more specific content from the files
      let finalSummary = result.summary;
      if (isGenericResponse || !result.summary) {
        logger.warn('[performSemanticAnalysis] Generic or missing response detected, extracting direct content', {
          requestId,
          originalSummary: result.summary,
          isGeneric: isGenericResponse
        });
        
        // Try to extract meaningful content directly from the files
        const fallbackAnalysis = this.performContentBasedAnalysis(query, files, requestId);
        if (fallbackAnalysis.summary && fallbackAnalysis.summary.length > 50 && 
            !fallbackAnalysis.summary.includes('Unable to extract')) {
          finalSummary = fallbackAnalysis.summary;
          logger.trace('[performSemanticAnalysis] Using fallback content extraction', {
            requestId,
            newSummaryLength: finalSummary.length,
            improvedResponse: true
          });
        }
      }
      
      const semanticResult = {
        summary: finalSummary || 'Content analysis unavailable',
        context: result.context || this.inferContext(files),
        keyThemes: ensureArray(result.keyThemes),
        entities: ensureArray(result.entities),
        relationships: ensureArray(result.relationships)
      };
      
      // Cache functionality temporarily disabled during migration
      
      return semanticResult;
    } catch (error) {
      logger.error('[performSemanticAnalysis] CRITICAL: OpenAI API call failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        hasOpenAI: !!openai,
        filesCount: files.length,
        queryLength: query.length,
        contentLength: fileDescriptions.length,
        errorName: error instanceof Error ? error.name : typeof error,
        promptLength: prompt?.length || 0,
        actualContentWasSent: fileDescriptions.trim().length > 0,
        isNetworkError: error instanceof Error && (error.message.includes('ECONNRESET') || error.message.includes('timeout')),
        isAPIError: error instanceof Error && error.message.includes('API'),
        isRateLimitError: error instanceof Error && error.message.includes('rate limit')
      });
      
      // Set tokens to 0 for fallback
      this.lastTokensUsed = 0;
      
      // IMPORTANT: Use enhanced fallback that extracts actual content
      logger.warn('[performSemanticAnalysis] Using content-based fallback analysis', {
        requestId
      });
      const fallbackResult = this.performContentBasedAnalysis(query, files, requestId);
      
      // Log fallback result quality
      logger.trace('[performSemanticAnalysis] Fallback analysis result:', {
        fallbackSummaryLength: fallbackResult.summary.length,
        fallbackThemesCount: fallbackResult.keyThemes.length,
        fallbackHasContent: fallbackResult.summary.length > 50,
        fallbackIsGeneric: fallbackResult.summary.includes('Unable to extract')
      });
      
      return fallbackResult;
    }
  }

  /**
   * Perform statistical analysis on data
   */
  private async performStatisticalAnalysis(
    query: string,
    files: FileContext[],
    intent: QueryIntent
  ): Promise<StatisticalAnalysis> {
    const metrics: Record<string, any> = {};
    const aggregations: any[] = [];
    const patterns: string[] = [];
    
    for (const file of files) {
      if (file.data && file.data.length > 0) {
        // Calculate basic statistics
        metrics[`${file.filename}_rows`] = file.rowCount || file.data.length;
        
        // Analyze columns if schema is available
        if (file.schema?.columns) {
          for (const column of file.schema.columns) {
            if (column.type === 'number' && file.data.length > 0) {
              const values = file.data
                .map(row => row[column.name])
                .filter(v => v != null && !isNaN(v));
              
              if (values.length > 0) {
                const stats = this.calculateStatistics(values);
                metrics[`${column.name}_stats`] = stats;
                
                // Add to aggregations for presentation
                aggregations.push({
                  column: column.name,
                  ...stats
                });
              }
            }
          }
        }
        
        // Detect patterns
        patterns.push(...this.detectPatterns(file.data, file.schema));
      }
    }
    
    return {
      metrics,
      aggregations,
      distributions: [],
      patterns,
      outliers: []
    };
  }

  /**
   * Generate context-aware SQL
   */
  private async generateContextAwareSQL(
    query: string,
    files: FileContext[],
    semantic: SemanticAnalysis
  ): Promise<string> {
    // This will be enhanced by the api.chat-query.tsx endpoint
    // For now, return empty as SQL generation is handled separately
    return '';
  }

  /**
   * Compose the presentation layer
   */
  private async composePresentationLayer(
    query: string,
    semantic: SemanticAnalysis,
    statistical: StatisticalAnalysis,
    intent: QueryIntent,
    files: FileContext[]
  ): Promise<PresentationLayer> {
    // Generate narrative based on intent
    const narrative = await this.generateNarrative(
      query,
      semantic,
      statistical,
      intent,
      files
    );
    
    // Create tables if appropriate
    const tables = this.shouldIncludeTables(intent)
      ? this.createPresentationTables(statistical, files)
      : [];
    
    // Extract insights
    const insights = this.extractInsights(semantic, statistical, files);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(
      semantic,
      statistical,
      intent
    );
    
    // Suggest visualizations
    const visualizationSuggestions = this.suggestVisualizations(
      statistical,
      intent
    );
    
    return {
      narrative,
      tables,
      insights,
      recommendations,
      visualizationSuggestions
    };
  }

  /**
   * Generate natural narrative
   */
  private async generateNarrative(
    query: string,
    semantic: SemanticAnalysis,
    statistical: StatisticalAnalysis,
    intent: QueryIntent,
    files: FileContext[]
  ): Promise<string> {
    // Handle specific format preferences
    if (intent.formatPreference === 'table-only') {
      return ''; // No narrative for table-only requests
    }
    
    if (intent.formatPreference === 'specific-answer') {
      // Return just the specific answer
      const answer = this.extractSpecificAnswer(query, statistical);
      if (answer) return answer;
    }
    
    // Build comprehensive narrative
    const parts: string[] = [];
    
    // Start with context
    parts.push(this.generateContextIntro(files, semantic));
    
    // Add key findings
    if (statistical.patterns.length > 0) {
      parts.push(this.narratePatterns(statistical.patterns));
    }
    
    // Weave in statistics naturally
    if (statistical.aggregations.length > 0) {
      parts.push(this.narrateStatistics(statistical.aggregations));
    }
    
    // Add thematic insights
    if (semantic.keyThemes.length > 0) {
      parts.push(this.narrateThemes(semantic.keyThemes));
    }
    
    return parts.filter(p => p).join('\n\n');
  }

  /**
   * Helper: Generate context introduction
   */
  private generateContextIntro(files: FileContext[], semantic: SemanticAnalysis): string {
    const fileTypes = [...new Set(files.map(f => f.type))];
    const totalRows = files.reduce((sum, f) => sum + (f.rowCount || 0), 0);
    
    if (fileTypes.includes('pdf')) {
      const pdfFile = files.find(f => f.type === 'pdf');
      return `This ${semantic.context || 'document'} ${semantic.summary || 'contains information'}.`;
    }
    
    if (fileTypes.includes('csv') || fileTypes.includes('excel')) {
      return `This dataset ${semantic.context ? `from ${semantic.context}` : ''} contains ${totalRows.toLocaleString()} records. ${semantic.summary || ''}`;
    }
    
    return semantic.summary || 'Analyzing the provided content...';
  }

  /**
   * Helper: Narrate patterns naturally
   */
  private narratePatterns(patterns: string[]): string {
    if (patterns.length === 0) return '';
    
    const intro = patterns.length === 1 
      ? 'The data shows'
      : 'The data reveals several patterns:';
    
    if (patterns.length === 1) {
      return `${intro} ${patterns[0]}.`;
    }
    
    return `${intro}\n${patterns.map(p => `• ${p}`).join('\n')}`;
  }

  /**
   * Helper: Narrate statistics naturally
   */
  private narrateStatistics(aggregations: any[]): string {
    if (aggregations.length === 0) return '';
    
    const keyStats = aggregations.slice(0, 3);
    const parts: string[] = [];
    
    for (const stat of keyStats) {
      if (stat.column && stat.mean != null) {
        parts.push(`The average ${this.humanizeColumnName(stat.column)} is ${this.formatNumber(stat.mean)}`);
      }
    }
    
    return parts.join(', ');
  }

  /**
   * Helper: Narrate themes
   */
  private narrateThemes(themes: string[]): string {
    // Ensure themes is an array
    const themeArray = Array.isArray(themes) ? themes : [];
    
    if (themeArray.length === 0) return '';
    
    return `Key themes include: ${themeArray.join(', ')}.`;
  }

  /**
   * Helper: Create presentation tables
   */
  private createPresentationTables(
    statistical: StatisticalAnalysis,
    files: FileContext[]
  ): TableData[] {
    const tables: TableData[] = [];
    
    // Create summary statistics table if we have aggregations
    if (statistical.aggregations.length > 0) {
      tables.push({
        title: 'Summary Statistics',
        headers: ['Metric', 'Value', 'Min', 'Max', 'Average'],
        rows: statistical.aggregations.map(agg => [
          this.humanizeColumnName(agg.column),
          this.formatNumber(agg.sum || agg.count),
          this.formatNumber(agg.min),
          this.formatNumber(agg.max),
          this.formatNumber(agg.mean)
        ])
      });
    }
    
    return tables;
  }

  /**
   * Helper: Extract insights
   */
  private extractInsights(
    semantic: SemanticAnalysis,
    statistical: StatisticalAnalysis,
    files: FileContext[]
  ): string[] {
    const insights: string[] = [];
    
    // Only add pattern-based insights if they're specific
    for (const pattern of statistical.patterns.slice(0, 3)) {
      if (pattern.length > 20 && !pattern.includes('pattern')) {
        insights.push(`📊 ${pattern}`);
      }
    }
    
    // Only add theme-based insights if they're meaningful
    for (const theme of semantic.keyThemes.slice(0, 2)) {
      // Skip generic themes like "Analysis", "Data", etc.
      if (theme.length > 10 && 
          !theme.includes('Analysis') && 
          !theme.includes('Focus area') &&
          !theme.includes('Data')) {
        insights.push(`Key theme: ${theme}`);
      }
    }
    
    return insights;
  }

  /**
   * Helper: Generate recommendations
   */
  private generateRecommendations(
    semantic: SemanticAnalysis,
    statistical: StatisticalAnalysis,
    intent: QueryIntent
  ): string[] {
    const recommendations: string[] = [];
    
    // Only add recommendations if we have specific, actionable insights
    if (intent.queryType === 'analysis' && statistical.patterns.length > 2) {
      // Only if we found meaningful patterns
      const specificPattern = statistical.patterns.find(p => p.length > 30);
      if (specificPattern) {
        recommendations.push(`Based on the pattern: ${specificPattern}`);
      }
    }
    
    // Don't add generic recommendations
    // Users don't need to be told to "explore metrics" - they know that
    
    return recommendations;
  }

  /**
   * Helper: Suggest visualizations
   */
  private suggestVisualizations(
    statistical: StatisticalAnalysis,
    intent: QueryIntent
  ): string[] {
    const suggestions: string[] = [];
    
    if (statistical.aggregations.length > 0) {
      suggestions.push('Bar chart for comparing metrics');
    }
    
    if (statistical.distributions.length > 0) {
      suggestions.push('Histogram for distribution analysis');
    }
    
    return suggestions;
  }

  /**
   * Helper utilities
   */
  private describeFile(file: FileContext): string {
    const type = file.type === 'pdf' ? 'document' : 'dataset';
    const size = file.rowCount ? `${file.rowCount} rows` : '';
    
    // CRITICAL DEBUG: Log exactly what we receive
    logger.trace('[describeFile] START - Raw file input', {
      filename: file.filename,
      type: file.type,
      hasContent: !!file.content,
      contentType: typeof file.content,
      contentIsArray: Array.isArray(file.content),
      contentLength: Array.isArray(file.content) ? file.content.length :
                     typeof file.content === 'string' ? file.content.length : 0,
      hasData: !!file.data,
      dataIsArray: Array.isArray(file.data),
      dataLength: Array.isArray(file.data) ? file.data.length : 0,
      hasSample: !!file.sample,
      sampleType: typeof file.sample,
      rowCount: file.rowCount,
      firstDataRow: file.data?.[0] ? Object.keys(file.data[0]) : null
    });
    
    // Include actual content for PDFs if available
    if (file.type === 'pdf') {
      // Optimized for "lost in middle" phenomenon - prioritize relevant chunks
      let contentPreview = '';
      
      // First try to get content from various sources
      if (file.content) {
        if (typeof file.content === 'string') {
          contentPreview = file.content.slice(0, 30000); // Reduced to avoid context degradation
        } else if (Array.isArray(file.content)) {
          // Filter out empty strings and join with proper spacing
          const validChunks = file.content.filter(chunk => chunk && chunk.trim().length > 0);
          
          if (validChunks.length > 50) {
            // Take first 30 chunks and last 20 chunks to leverage U-shaped performance
            const firstChunks = validChunks.slice(0, 30).join('\n\n');
            const lastChunks = validChunks.slice(-20).join('\n\n');
            contentPreview = `${firstChunks}\n\n[... middle content ...]\n\n${lastChunks}`;
          } else {
            // If not too many chunks, include all
            contentPreview = validChunks.join('\n\n');
          }
        }
      } else if (file.extractedContent) {
        // Fallback to extractedContent if content is not available
        if (Array.isArray(file.extractedContent)) {
          contentPreview = file.extractedContent.filter(Boolean).join('\n\n').slice(0, 30000);
        } else {
          contentPreview = String(file.extractedContent).slice(0, 30000);
        }
      } else if (file.data && Array.isArray(file.data)) {
        // Last resort: extract from data rows
        const textChunks = file.data
          .map((row: any) => row.text || row.content || row.chunk_text || '')
          .filter(Boolean);
        contentPreview = textChunks.join('\n\n').slice(0, 30000);
      }
      
      logger.trace('[describeFile] Including PDF content', {
        filename: file.filename,
        contentLength: contentPreview.length,
        hasContent: !!contentPreview,
        contentStartsWith: contentPreview.slice(0, 100),
        isContentEmpty: contentPreview.trim().length === 0,
        wordCount: contentPreview.split(/\s+/).length
      });
      
      // CRITICAL DEBUG: Log exactly what content is being included
      logger.trace('[describeFile] EXACT PDF CONTENT BEING INCLUDED:', {
        filename: file.filename,
        fullContentLength: contentPreview.length,
        actualContentIncluded: contentPreview.slice(0, 1500), // Log more content
        hasActualText: /[a-zA-Z]{20,}/.test(contentPreview),
        looksLikeValidContent: contentPreview.includes(' ') && contentPreview.length > 100
      });
      
      return `${file.filename} (${type}${size ? `, ${size}` : ''})\n\nContent:\n${contentPreview}`;
    }
    
    // Include sample data for CSV/Excel if available
    if ((file.type === 'csv' || file.type === 'excel')) {
      logger.trace('[describeFile] CSV/Excel file detected', {
        filename: file.filename,
        type: file.type,
        hasContent: !!file.content,
        contentType: typeof file.content,
        hasData: !!file.data,
        dataLength: Array.isArray(file.data) ? file.data.length : 0,
        hasSample: !!file.sample,
        rowCount: file.rowCount
      });
      
      // Use full content if available, otherwise use sample
      let dataContent = '';
      
      // Handle different content formats
      if (file.content) {
        logger.trace('[describeFile] CSV has content field', {
          filename: file.filename,
          contentType: typeof file.content,
          isArray: Array.isArray(file.content),
          arrayLength: Array.isArray(file.content) ? file.content.length : 0,
          firstItemType: Array.isArray(file.content) && file.content[0] ? typeof file.content[0] : 'no-items'
        });
        
        if (typeof file.content === 'string') {
          dataContent = file.content;
          logger.trace('[describeFile] CSV content is string', {
            filename: file.filename,
            stringLength: dataContent.length,
            preview: dataContent.slice(0, 200)
          });
        } else if (Array.isArray(file.content)) {
          logger.trace('[describeFile] CSV/Excel content is array', {
            filename: file.filename,
            fileType: file.type,
            arrayLength: file.content.length,
            firstItemType: file.content[0] ? typeof file.content[0] : 'empty',
            firstItem: file.content[0] ? 
              (typeof file.content[0] === 'object' ? JSON.stringify(file.content[0]).slice(0, 200) : String(file.content[0]).slice(0, 200)) : 
              'no-first-item',
            isSmallExcelFile: file.type === 'excel' && file.content.length <= 20
          });
          
          // Content might be array of strings or array of objects
          if (file.content.length > 0 && typeof file.content[0] === 'object') {
            // Array of objects - format as a readable table-like structure
            const headers = Object.keys(file.content[0]);
            dataContent = `Columns: ${headers.join(', ')}\n`;
            // Include first 100 rows as readable data
            const sampleRows = file.content.slice(0, 100);
            sampleRows.forEach((row, idx) => {
              dataContent += `Row ${idx + 1}: ${JSON.stringify(row)}\n`;
            });
            if (file.content.length > 100) {
              dataContent += `\n... and ${file.content.length - 100} more rows\n`;
            }
          } else {
            // Array of strings
            dataContent = file.content.map(item => 
              typeof item === 'string' ? item : JSON.stringify(item)
            ).join('\n');
          }
        } else if (typeof file.content === 'object') {
          dataContent = JSON.stringify(file.content);
        }
      } else if (file.sample) {
        dataContent = typeof file.sample === 'string' ? file.sample : JSON.stringify(file.sample);
        logger.trace('[describeFile] Using sample field', {
          filename: file.filename,
          sampleType: typeof file.sample,
          sampleLength: dataContent.length,
          preview: dataContent.slice(0, 200)
        });
      } else if (file.data && Array.isArray(file.data)) {
        logger.trace('[describeFile] Using data field', {
          filename: file.filename,
          dataLength: file.data.length,
          firstRow: file.data[0] ? JSON.stringify(file.data[0]).slice(0, 200) : 'no-first-row'
        });
        
        // Use data array if content is not available
        const headers = file.data.length > 0 ? Object.keys(file.data[0]) : [];
        dataContent = `Columns: ${headers.join(', ')}\n`;
        dataContent += `Total Rows: ${file.data.length}\n\n`;
        
        // For Excel files with few rows, include all data to ensure enough context
        const rowLimit = (file.type === 'excel' && file.data.length <= 20) ? file.data.length : 100;
        const sampleRows = file.data.slice(0, rowLimit);
        
        dataContent += `${file.type === 'excel' && file.data.length <= 20 ? 'Complete Data:' : 'Sample Data:'}\n`;
        sampleRows.forEach((row, idx) => {
          dataContent += `Row ${idx + 1}: ${JSON.stringify(row)}\n`;
        });
        
        // Add summary for Excel files with small datasets
        if (file.type === 'excel' && file.data.length <= 20) {
          dataContent += `\n[Excel Dataset Summary]\n`;
          dataContent += `This Excel file contains ${file.data.length} total rows with ${headers.length} columns.\n`;
          headers.forEach(header => {
            const values = file.data.map((r: any) => r[header]).filter(v => v !== null && v !== undefined);
            const uniqueCount = new Set(values).size;
            dataContent += `  - ${header}: ${uniqueCount} unique values\n`;
          });
        } else if (file.data.length > rowLimit) {
          dataContent += `\n... and ${file.data.length - rowLimit} more rows\n`;
        }
      }
      
      // CRITICAL DEBUG: Log the final dataContent
      logger.trace('[describeFile] FINAL dataContent status', {
        filename: file.filename,
        fileType: file.type,
        hasDataContent: !!dataContent,
        dataContentLength: dataContent.length,
        dataContentPreview: dataContent.slice(0, 500),
        isEmpty: dataContent.trim().length === 0,
        containsActualData: dataContent.includes('Row') || dataContent.includes('Columns:'),
        wordCount: dataContent.split(/\s+/).length,
        isExcel: file.type === 'excel',
        rowCount: file.data?.length || 0
      });
      
      if (dataContent) {
        logger.trace('[describeFile] Including CSV/Excel content', {
          filename: file.filename,
          hasContent: !!file.content,
          hasSample: !!file.sample,
          hasData: !!file.data,
          contentLength: dataContent.length,
          willReturnContent: true
        });
        
        // Limit content size for API calls
        const preview = dataContent.slice(0, 50000);  // Increased to match PDF limit
        
        const result = `${file.filename} (${type}${size ? `, ${size}` : ''})\n\nData:\n${preview}`;
        
        // CRITICAL: Log exactly what we're returning
        logger.trace('[describeFile] RETURNING CSV/EXCEL CONTENT', {
          filename: file.filename,
          fileType: file.type,
          returnLength: result.length,
          resultPreview: result.slice(0, 1000),
          containsData: result.includes('Data:'),
          containsRows: result.includes('Row'),
          isExcelWithFullData: file.type === 'excel' && result.includes('Complete Data:'),
          hasExcelSummary: result.includes('[Excel Dataset Summary]')
        });
        
        return result;
      } else {
        logger.warn('[describeFile] NO CONTENT FOUND FOR CSV', {
          filename: file.filename,
          hadContent: !!file.content,
          hadData: !!file.data,
          hadSample: !!file.sample
        });
      }
    }
    
    // CRITICAL: Log when we return without content
    const fallbackResult = `${file.filename} (${type}${size ? `, ${size}` : ''})`;
    logger.warn('[describeFile] RETURNING WITHOUT CONTENT', {
      filename: file.filename,
      type: file.type,
      result: fallbackResult,
      hadContent: !!file.content,
      hadData: !!file.data,
      reason: 'No content extraction matched'
    });
    
    return fallbackResult;
  }

  private inferContext(files: FileContext[]): string {
    // Infer context from filenames and content
    const names = files.map(f => f.filename.toLowerCase());
    
    if (names.some(n => n.includes('sales'))) return 'sales data';
    if (names.some(n => n.includes('customer'))) return 'customer information';
    if (names.some(n => n.includes('product'))) return 'product catalog';
    if (names.some(n => n.includes('financial'))) return 'financial records';
    
    return 'business data';
  }

  private performBasicSemanticAnalysis(files: FileContext[]): SemanticAnalysis {
    // DEPRECATED: This returns generic responses - use performContentBasedAnalysis instead
    logger.warn('[performBasicSemanticAnalysis] DEPRECATED - returning generic response');
    return {
      summary: `Analyzing ${files.length} file(s)`,
      context: this.inferContext(files),
      keyThemes: [],
      entities: [],
      relationships: []
    };
  }

  /**
   * Perform content-based analysis when OpenAI is unavailable or fails
   * Extracts actual content from files instead of returning generic responses
   */
  private performContentBasedAnalysis(
    query: string,
    files: FileContext[],
    requestId?: string
  ): SemanticAnalysis {
    logger.trace('[performContentBasedAnalysis] Extracting content directly', {
      requestId,
      filesCount: files.length,
      query,
      reason: 'OpenAI failed or unavailable - using local content extraction'
    });

    let combinedContent = '';
    const extractedThemes = new Set<string>();
    const extractedEntities = new Set<string>();
    
    for (const file of files) {
      logger.trace('[performContentBasedAnalysis] Processing file', {
        requestId,
        filename: file.filename,
        type: file.type,
        hasContent: !!file.content,
        hasData: !!file.data,
        hasExtractedContent: !!file.extractedContent
      });

      if (file.type === 'pdf') {
        // Extract actual PDF content
        let pdfContent = '';
        
        // Try multiple content sources
        if (file.content) {
          pdfContent = Array.isArray(file.content) 
            ? file.content.filter(Boolean).join(' ')
            : String(file.content);
        } else if (file.extractedContent) {
          pdfContent = Array.isArray(file.extractedContent)
            ? file.extractedContent.filter(Boolean).join(' ')
            : String(file.extractedContent);
        } else if (file.data && Array.isArray(file.data)) {
          // Try to extract from data rows
          pdfContent = file.data
            .map((row: any) => row.text || row.content || '')
            .filter(Boolean)
            .join(' ');
        }
        
        if (pdfContent.length > 0) {
          logger.trace('[performContentBasedAnalysis] PDF content found', {
            filename: file.filename,
            contentLength: pdfContent.length,
            sample: pdfContent.slice(0, 200),
            wordCount: pdfContent.split(/\s+/).length,
            hasActualWords: /[a-zA-Z]{10,}/.test(pdfContent),
            isSubstantialContent: pdfContent.length > 500
          });
          
          // CRITICAL: Log what content is actually being used for fallback analysis
          logger.trace('[performContentBasedAnalysis] FALLBACK CONTENT BEING ANALYZED:', {
            filename: file.filename,
            extractedContentPreview: pdfContent.slice(0, 1000),
            sourceOfContent: file.content ? 'file.content' : 
                           file.extractedContent ? 'file.extractedContent' : 
                           file.data ? 'file.data' : 'unknown',
            contentQuality: {
              hasLetters: /[a-zA-Z]/.test(pdfContent),
              hasWords: /\w+/.test(pdfContent),
              hasSentences: /\.\s+[A-Z]/.test(pdfContent),
              isReadableText: pdfContent.length > 100 && /[a-zA-Z]/.test(pdfContent)
            }
          });
          
          combinedContent += `\n\n[Document: ${file.filename}]\n${pdfContent.slice(0, 25000)}`; // Increased for better fallback analysis
          
          // Extract themes from PDF content
          const contentLower = pdfContent.toLowerCase();
          
          // Look for key concepts mentioned in the query
          const queryWords = query.toLowerCase().split(/\s+/);
          queryWords.forEach(word => {
            if (word.length > 4 && contentLower.includes(word)) {
              extractedThemes.add(`${word.charAt(0).toUpperCase() + word.slice(1)} Analysis`);
            }
          });
          
          // Extract domain-specific themes
          if (contentLower.includes('identity')) extractedThemes.add('Identity and Self-Concept');
          if (contentLower.includes('technology')) extractedThemes.add('Technology Impact');
          if (contentLower.includes('psychological')) extractedThemes.add('Psychological Dimensions');
          if (contentLower.includes('algorithmic')) extractedThemes.add('Algorithmic Influence');
          if (contentLower.includes('social media')) extractedThemes.add('Social Media Effects');
          if (contentLower.includes('digital')) extractedThemes.add('Digital Transformation');
          if (contentLower.includes('self')) extractedThemes.add('Self-Expression and Identity');
          
          // Extract specific sections mentioned in query
          if (query.toLowerCase().includes('historical') && contentLower.includes('historical')) {
            const historicalStart = contentLower.indexOf('historical');
            const historicalSection = pdfContent.slice(historicalStart, historicalStart + 1000);
            extractedThemes.add('Historical Context');
            combinedContent += `\n\n[Historical Section]: ${historicalSection}`;
          }
          
          if (query.toLowerCase().includes('algorithmic self') && contentLower.includes('algorithmic self')) {
            const algorithmicStart = contentLower.indexOf('algorithmic self');
            const algorithmicSection = pdfContent.slice(algorithmicStart, algorithmicStart + 1000);
            extractedThemes.add('The Algorithmic Self');
            combinedContent += `\n\n[Algorithmic Self Section]: ${algorithmicSection}`;
          }
        } else {
          logger.warn('[performContentBasedAnalysis] No PDF content found', {
            filename: file.filename
          });
        }
      } else if (file.type === 'csv' || file.type === 'excel') {
        // Handle structured data
        if (file.data && Array.isArray(file.data) && file.data.length > 0) {
          const headers = Object.keys(file.data[0]);
          // For Excel files with few rows, include all data for better analysis
          const rowLimit = (file.type === 'excel' && file.data.length <= 20) ? file.data.length : 10;
          const sampleRows = file.data.slice(0, rowLimit);
          
          combinedContent += `\n\n[Dataset: ${file.filename}]\n`;
          combinedContent += `Type: ${file.type === 'excel' ? 'Excel Spreadsheet' : 'CSV File'}\n`;
          combinedContent += `Columns: ${headers.join(', ')}\n`;
          combinedContent += `Rows: ${file.rowCount || file.data.length}\n`;
          combinedContent += `${file.type === 'excel' && file.data.length <= 20 ? 'Complete Data:' : 'Sample Data:'}\n`;
          
          sampleRows.forEach((row, idx) => {
            combinedContent += `Row ${idx + 1}: ${JSON.stringify(row)}\n`;
          });
          
          // Add more context for small Excel files
          if (file.type === 'excel' && file.data.length <= 20) {
            combinedContent += `\n[Complete Dataset Analysis]\n`;
            headers.forEach(header => {
              const values = file.data.map((r: any) => r[header]).filter(v => v !== null && v !== undefined);
              const uniqueValues = [...new Set(values)];
              if (uniqueValues.length <= 5) {
                combinedContent += `${header}: ${uniqueValues.join(', ')}\n`;
              } else {
                combinedContent += `${header}: ${uniqueValues.length} unique values\n`;
              }
            });
          }
          
          // Extract themes from column names and data
          headers.forEach(header => {
            const headerLower = header.toLowerCase();
            if (headerLower.includes('sales')) extractedThemes.add('Sales Analysis');
            if (headerLower.includes('customer')) extractedThemes.add('Customer Data');
            if (headerLower.includes('product')) extractedThemes.add('Product Information');
            if (headerLower.includes('revenue')) extractedThemes.add('Revenue Metrics');
            if (headerLower.includes('competitor')) extractedThemes.add('Competitor Analysis');
            if (headerLower.includes('ai')) extractedThemes.add('AI Technology');
          });
        }
      }
    }
    
    // Generate meaningful summary based on actual content
    let summary = '';
    if (combinedContent.length > 100) {
      // Extract the most relevant part based on the query
      const queryLower = query.toLowerCase();
      const contentLines = combinedContent.split('\n');
      const relevantLines = contentLines.filter(line => {
        const lineLower = line.toLowerCase();
        return queryLower.split(/\s+/).some(word => word.length > 3 && lineLower.includes(word));
      });
      
      if (relevantLines.length > 0) {
        // Remove redundant prefixes and clean up the summary
        const cleanedContent = relevantLines.slice(0, 3).join(' ')
          .replace(/^\[Document:.*?\]\s*/, '')
          .replace(/^\[Dataset:.*?\]\s*/, '')
          .trim();
        summary = `The content analysis reveals: ${cleanedContent}`;
      } else {
        // Use actual content without generic prefixes
        const cleanedContent = combinedContent.slice(0, 500)
          .replace(/\n+/g, ' ')
          .replace(/^\[Document:.*?\]\s*/, '')
          .replace(/^\[Dataset:.*?\]\s*/, '')
          .trim();
        summary = cleanedContent;
      }
    } else {
      summary = `Unable to extract sufficient content from ${files.map(f => f.filename).join(', ')}. Please ensure the files contain readable text.`;
    }
    
    const result = {
      summary: summary.slice(0, 1000),
      context: combinedContent.length > 100 
        ? `Detailed content analysis from ${files.length} document(s)` 
        : this.inferContext(files),
      keyThemes: Array.from(extractedThemes).slice(0, 10),
      entities: Array.from(extractedEntities).slice(0, 10),
      relationships: this.extractContentRelationships(combinedContent)
    };
    
    logger.trace('[performContentBasedAnalysis] Analysis complete', {
      summaryLength: result.summary.length,
      themesCount: result.keyThemes.length,
      hasActualContent: combinedContent.length > 100,
      contentLength: combinedContent.length,
      finalSummary: result.summary,
      extractedThemes: result.keyThemes,
      wasContentExtracted: combinedContent.length > 100,
      summaryMeaningful: result.summary.length > 50 && !result.summary.includes('Unable to extract')
    });
    
    // CRITICAL: Final validation that we extracted meaningful content
    if (combinedContent.length < 100) {
      logger.error('[performContentBasedAnalysis] FAILED TO EXTRACT MEANINGFUL CONTENT:', {
        totalContentLength: combinedContent.length,
        fileCount: files.length,
        filesProcessed: files.map(f => ({
          filename: f.filename,
          type: f.type,
          hadContent: !!f.content,
          hadData: !!f.data,
          hadExtractedContent: !!f.extractedContent
        }))
      });
    }
    
    return result;
  }

  private extractContentRelationships(content: string): string[] {
    const relationships: string[] = [];
    
    if (!content || content.length < 50) return relationships;
    
    const contentLower = content.toLowerCase();
    
    // Look for relationship indicators
    if (contentLower.includes('leads to') || contentLower.includes('results in')) {
      relationships.push('Causal relationships identified');
    }
    if (contentLower.includes('correlat') || contentLower.includes('associat')) {
      relationships.push('Correlations present in data');
    }
    if (contentLower.includes('impact') || contentLower.includes('affect')) {
      relationships.push('Impact relationships documented');
    }
    if (contentLower.includes('between') && contentLower.includes('and')) {
      relationships.push('Inter-variable relationships');
    }
    
    return relationships;
  }

  private getEmptyStatisticalAnalysis(): StatisticalAnalysis {
    return {
      metrics: {},
      aggregations: [],
      distributions: [],
      patterns: [],
      outliers: []
    };
  }

  private calculateStatistics(values: number[]): any {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    
    return {
      count: values.length,
      sum,
      mean,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)]
    };
  }

  private detectPatterns(data: any[], schema: any): string[] {
    const patterns: string[] = [];
    
    // Detect trends if there's a date column
    // Detect correlations between numeric columns
    // This would be enhanced with more sophisticated analysis
    
    return patterns;
  }

  private shouldGenerateSQL(intent: QueryIntent, files: FileContext[]): boolean {
    // Generate SQL for data files, not for PDFs (unless they have extracted tables)
    const hasData = files.some(f => f.type === 'csv' || f.type === 'excel' || (f.data && f.data.length > 0));
    return hasData && intent.needsDataAccess;
  }

  private shouldIncludeTables(intent: QueryIntent): boolean {
    return intent.formatPreference !== 'narrative-only';
  }

  private extractSpecificAnswer(query: string, statistical: StatisticalAnalysis): string | null {
    // Extract specific numeric answers
    // This would be enhanced based on the specific request
    return null;
  }

  private humanizeColumnName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  private formatNumber(value: any): string {
    if (value == null) return '-';
    if (typeof value !== 'number') return String(value);
    
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }
    
    return value.toFixed(2);
  }

  private calculateResponseConfidence(
    semantic: SemanticAnalysis,
    statistical: StatisticalAnalysis,
    intent: QueryIntent
  ): number {
    let confidence = intent.confidence;
    
    // Increase confidence if we have rich analysis
    if (semantic.keyThemes.length > 0) confidence += 0.1;
    if (statistical.patterns.length > 0) confidence += 0.1;
    
    return Math.min(1, confidence);
  }
}

// Export singleton instance
export const unifiedIntelligence = new UnifiedIntelligenceService();