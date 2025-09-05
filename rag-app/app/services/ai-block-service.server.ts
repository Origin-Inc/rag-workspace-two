import { prisma } from '~/utils/db.server';
import { embeddingGenerationService } from './embedding-generation.server';
import { ragService } from './rag.server';
import { DebugLogger } from '~/utils/debug-logger';
import type { SearchResult } from './embedding-generation.server';

const logger = new DebugLogger('AIBlockService');

export interface AIBlockRequest {
  query: string;
  workspaceId: string;
  pageId?: string;
  blockId?: string;
  context?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface AIBlockResponse {
  success: boolean;
  answer?: string;
  citations?: Array<{
    pageId: string;
    pageTitle: string;
    snippet: string;
    relevance: number;
  }>;
  error?: string;
  debugInfo?: {
    searchResultsCount: number;
    contextLength: number;
    processingTimeMs: number;
    retryCount: number;
    cacheHit: boolean;
  };
}

export class AIBlockService {
  private static instance: AIBlockService;
  private responseCache: Map<string, { response: AIBlockResponse; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 30 * 1000; // 30 seconds - reduced from 5 minutes for faster updates
  private readonly DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;

  private constructor() {}

  static getInstance(): AIBlockService {
    if (!AIBlockService.instance) {
      AIBlockService.instance = new AIBlockService();
    }
    return AIBlockService.instance;
  }

  async processQuery(request: AIBlockRequest): Promise<AIBlockResponse> {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey(request);
    
    logger.info('🤖 === STARTING AI BLOCK PROCESSING ===', {
      query: request.query,
      workspaceId: request.workspaceId,
      pageId: request.pageId,
      blockId: request.blockId,
      timestamp: new Date().toISOString()
    });

    // Check cache first - but skip cache for certain queries that need fresh data
    const shouldSkipCache = request.query.toLowerCase().includes('summarize') || 
                           request.query.toLowerCase().includes('latest') ||
                           request.query.toLowerCase().includes('current') ||
                           request.query.toLowerCase().includes('update');
    
    if (!shouldSkipCache) {
      const cachedResponse = this.getCachedResponse(cacheKey);
      if (cachedResponse) {
        logger.info('Cache hit for AI block query', { cacheKey });
        return {
          ...cachedResponse,
          debugInfo: {
            ...cachedResponse.debugInfo!,
            cacheHit: true,
            processingTimeMs: Date.now() - startTime
          }
        };
      }
    } else {
      logger.info('Skipping cache for fresh data query', {
        query: request.query,
        cacheKey
      });
    }

    const maxRetries = request.maxRetries ?? this.MAX_RETRIES;
    const timeoutMs = request.timeoutMs ?? this.DEFAULT_TIMEOUT_MS;
    
    let lastError: Error | null = null;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        logger.info(`🔄 Attempt ${retryCount + 1} of ${maxRetries}`, {
          query: request.query,
          workspaceId: request.workspaceId,
          pageId: request.pageId
        });
        
        const response = await this.executeQueryWithTimeout(request, timeoutMs);
        
        // Cache successful response
        this.setCachedResponse(cacheKey, response);
        
        logger.info('AI block query completed successfully', {
          processingTimeMs: Date.now() - startTime,
          retryCount,
          answerLength: response.answer?.length || 0,
          citationsCount: response.citations?.length || 0
        });

        return {
          ...response,
          debugInfo: {
            ...response.debugInfo!,
            processingTimeMs: Date.now() - startTime,
            retryCount,
            cacheHit: false
          }
        };
      } catch (error) {
        lastError = error as Error;
        retryCount++;
        
        logger.error(`Attempt ${retryCount} failed`, {
          error: lastError.message,
          query: request.query,
          willRetry: retryCount < maxRetries
        });

        if (retryCount < maxRetries) {
          // Exponential backoff
          const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
          logger.info(`Waiting ${backoffMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }

    // All retries failed
    logger.error('All retry attempts failed for AI block query', {
      query: request.query,
      error: lastError?.message,
      retryCount
    });

    return {
      success: false,
      error: `Failed after ${retryCount} attempts: ${lastError?.message || 'Unknown error'}`,
      debugInfo: {
        searchResultsCount: 0,
        contextLength: 0,
        processingTimeMs: Date.now() - startTime,
        retryCount,
        cacheHit: false
      }
    };
  }

  private async executeQueryWithTimeout(
    request: AIBlockRequest,
    timeoutMs: number
  ): Promise<AIBlockResponse> {
    return Promise.race([
      this.executeQuery(request),
      new Promise<AIBlockResponse>((_, reject) =>
        setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  private async executeQuery(request: AIBlockRequest): Promise<AIBlockResponse> {
    const { query, workspaceId, pageId, context } = request;

    // Step 1: Search for relevant content
    logger.info('🔍 Step 1: Searching for relevant content', { 
      query, 
      workspaceId,
      pageId,
      hasContext: !!context
    });
    
    // First try to search within the specific page if pageId is provided
    let searchResults = pageId 
      ? await embeddingGenerationService.searchSimilarDocuments(
          workspaceId,
          query,
          10,
          0.05, // Very low threshold to ensure we get results
          pageId // Pass pageId to scope search to current page only
        )
      : [];

    logger.info('✅ Page-specific search completed', { 
      pageId,
      resultsCount: searchResults.length,
      topResultScore: searchResults[0]?.similarity || 0,
      topResults: searchResults.slice(0, 3).map(r => ({
        pageId: r.pageId,
        similarity: r.similarity,
        contentPreview: r.content?.substring(0, 100),
        chunkIndex: r.chunkIndex
      }))
    });

    // If no results found with pageId, fall back to workspace-wide search
    if (searchResults.length === 0) {
      logger.info('📚 Falling back to workspace-wide search', { 
        workspaceId,
        reason: pageId ? 'No results in specific page' : 'No pageId provided'
      });
      
      searchResults = await embeddingGenerationService.searchSimilarDocuments(
        workspaceId,
        query,
        10,
        0.05, // Very low threshold to ensure we get results
        undefined // Search entire workspace
      );
      
      logger.info('✅ Workspace search completed', { 
        resultsCount: searchResults.length,
        topResultScore: searchResults[0]?.similarity || 0,
        results: searchResults.slice(0, 3).map(r => ({
          id: r.id,
          pageId: r.pageId,
          similarity: r.similarity,
          contentPreview: r.content?.substring(0, 100),
          chunkIndex: r.chunkIndex
        }))
      });
    }

    if (searchResults.length === 0) {
      logger.warn('⚠️ No relevant content found in entire workspace', { 
        query, 
        workspaceId,
        pageId
      });
      
      // Try to provide helpful response even without context
      return {
        success: true,
        answer: this.getNoResultsResponse(query),
        citations: [],
        debugInfo: {
          searchResultsCount: 0,
          contextLength: 0,
          processingTimeMs: 0,
          retryCount: 0,
          cacheHit: false
        }
      };
    }

    // Step 2: Build augmented context
    logger.info('📖 Step 2: Building augmented context', {
      searchResultsCount: searchResults.length
    });
    
    const augmentedContext = await ragService.buildAugmentedContext(
      query,
      searchResults,
      {
        maxTokens: 2500,
        includeCitations: true
      }
    );

    logger.info('Context built', {
      contextLength: augmentedContext.length,
      citationsCount: searchResults.length
    });

    // Step 3: Generate answer with citations
    logger.info('🤖 Step 3: Generating AI response', {
      queryLength: query.length,
      contextLength: augmentedContext.length
    });
    
    const { answer, citations } = await ragService.generateAnswerWithCitations(
      query,
      augmentedContext,
      {
        systemPrompt: this.getSystemPrompt(request),
        temperature: 0.7,
        maxTokens: 1500
      }
    );

    logger.info('✅ AI response generated successfully', {
      answerLength: answer.length,
      citationsCount: citations.length,
      answerPreview: answer.substring(0, 200)
    });

    // Step 4: Format citations
    const formattedCitations = await this.formatCitations(citations, searchResults);

    return {
      success: true,
      answer,
      citations: formattedCitations,
      debugInfo: {
        searchResultsCount: searchResults.length,
        contextLength: augmentedContext.length,
        processingTimeMs: 0,
        retryCount: 0,
        cacheHit: false
      }
    };
  }

  private async formatCitations(
    citations: any[],
    searchResults: SearchResult[]
  ): Promise<AIBlockResponse['citations']> {
    const formattedCitations: AIBlockResponse['citations'] = [];

    for (const citation of citations) {
      const matchingResult = searchResults.find(
        r => r.pageId === citation.pageId || r.content.includes(citation.text)
      );

      if (matchingResult) {
        // Get page details
        const page = await prisma.page.findUnique({
          where: { id: matchingResult.pageId },
          select: { id: true, title: true }
        });

        if (page) {
          formattedCitations.push({
            pageId: page.id,
            pageTitle: page.title || 'Untitled Page',
            snippet: citation.text || matchingResult.content.substring(0, 200),
            relevance: matchingResult.similarity
          });
        }
      }
    }

    return formattedCitations;
  }

  private getSystemPrompt(request: AIBlockRequest): string {
    const basePrompt = `You are an AI assistant helping users understand and work with their content. 
    Provide clear, concise, and helpful responses based on the context provided.
    If you reference specific information, indicate where it comes from.`;

    if (request.pageId) {
      return `${basePrompt}
      The user is currently on a specific page. Consider the current page context when answering.`;
    }

    return basePrompt;
  }

  private getNoResultsResponse(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('summarize')) {
      return "I couldn't find any content to summarize. Try adding some content to your pages first, and I'll be able to help you summarize it.";
    }
    
    if (lowerQuery.includes('explain') || lowerQuery.includes('what is')) {
      return "I don't have any information about that topic in your workspace yet. Try adding relevant content to your pages, and I'll be able to help explain it.";
    }
    
    return "I couldn't find any relevant information in your workspace to answer this question. Try adding more content to your pages, or refine your question to be more specific.";
  }

  private getCacheKey(request: AIBlockRequest): string {
    // Include blockId in cache key to allow different blocks to have different responses
    // This also helps when content changes and we want fresh responses
    const key = `${request.workspaceId}:${request.query}:${request.pageId || 'global'}:${request.blockId || 'default'}`;
    logger.info('🔑 Cache key generated', { key, request });
    return key;
  }
  
  // Method to clear cache for a specific page when content changes
  clearCacheForPage(workspaceId: string, pageId: string): number {
    const keysToDelete: string[] = [];
    for (const [key, _] of this.responseCache) {
      if (key.includes(workspaceId) && key.includes(pageId)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.responseCache.delete(key));
    if (keysToDelete.length > 0) {
      logger.info(`Cleared ${keysToDelete.length} cache entries for page ${pageId}`, {
        clearedKeys: keysToDelete,
        remainingCacheSize: this.responseCache.size
      });
    }
    return keysToDelete.length;
  }

  private getCachedResponse(key: string): AIBlockResponse | null {
    const cached = this.responseCache.get(key);
    
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.CACHE_TTL_MS) {
      this.responseCache.delete(key);
      return null;
    }
    
    return cached.response;
  }

  private setCachedResponse(key: string, response: AIBlockResponse): void {
    // Limit cache size
    if (this.responseCache.size > 100) {
      const firstKey = this.responseCache.keys().next().value;
      this.responseCache.delete(firstKey);
    }
    
    this.responseCache.set(key, {
      response,
      timestamp: Date.now()
    });
  }

  // Production monitoring methods
  async getHealthStatus(): Promise<{
    healthy: boolean;
    cacheSize: number;
    avgResponseTime: number;
    successRate: number;
  }> {
    // This would connect to your monitoring system
    return {
      healthy: true,
      cacheSize: this.responseCache.size,
      avgResponseTime: 0,
      successRate: 0
    };
  }

  clearCache(): void {
    logger.info('Clearing AI block cache', { size: this.responseCache.size });
    this.responseCache.clear();
  }
}

export const aiBlockService = AIBlockService.getInstance();