import { DebugLogger } from '~/utils/debug-logger';
import { IntentClassificationService } from './intent-classifier.server';
import { ContextExtractionEngine } from './context-extractor.server';
import { QueryRouter } from './query-router.server';
import { RouteHandlers } from './route-handlers.server';
import { StructuredOutputGenerator } from './structured-output.server';
import type { StructuredResponse } from './structured-output.server';
import { createSupabaseAdmin } from '~/utils/supabase.server';

// Orchestration result
export interface OrchestrationResult {
  success: boolean;
  response: StructuredResponse;
  performance: {
    totalTime: number;
    intentClassificationTime: number;
    contextExtractionTime: number;
    routingTime: number;
    executionTime: number;
    structuringTime: number;
  };
  debug?: {
    intent: string;
    confidence: number;
    route: string;
    dataSources: string[];
  };
}

// Cache configuration
interface CacheConfig {
  enabled: boolean;
  ttl: number; // in seconds
  maxSize: number;
}

export class LLMOrchestrator {
  private logger = new DebugLogger('LLMOrchestrator');
  private intentClassifier: IntentClassificationService;
  private contextExtractor: ContextExtractionEngine;
  private queryRouter: QueryRouter;
  private routeHandlers: RouteHandlers;
  private outputGenerator: StructuredOutputGenerator;
  private supabase = createSupabaseAdmin();
  
  // Response cache
  private responseCache = new Map<string, OrchestrationResult>();
  private cacheConfig: CacheConfig = {
    enabled: true,
    ttl: 300, // 5 minutes
    maxSize: 100
  };
  
  constructor(cacheConfig?: Partial<CacheConfig>) {
    this.intentClassifier = new IntentClassificationService();
    this.contextExtractor = new ContextExtractionEngine();
    this.queryRouter = new QueryRouter();
    this.routeHandlers = new RouteHandlers();
    this.outputGenerator = new StructuredOutputGenerator();
    
    if (cacheConfig) {
      this.cacheConfig = { ...this.cacheConfig, ...cacheConfig };
    }
  }
  
  /**
   * Main orchestration method - processes natural language queries
   */
  async processQuery(
    query: string,
    workspaceId: string,
    userId: string,
    options: {
      includeDebug?: boolean;
      bypassCache?: boolean;
      maxResponseTime?: number; // in ms
    } = {}
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const timings = {
      intentClassificationTime: 0,
      contextExtractionTime: 0,
      routingTime: 0,
      executionTime: 0,
      structuringTime: 0,
      totalTime: 0
    };
    
    this.logger.info('Processing query', {
      query,
      workspaceId,
      userId,
      options
    });
    
    try {
      // Check cache if enabled
      if (this.cacheConfig.enabled && !options.bypassCache) {
        const cached = this.getCachedResponse(query, workspaceId);
        if (cached) {
          this.logger.info('Returning cached response');
          return cached;
        }
      }
      
      // Step 1: Classify intent
      const classificationStart = Date.now();
      const classification = await this.intentClassifier.classifyIntent(query, {
        workspaceId,
        currentPage: undefined, // TODO: Add current page context
        recentActions: [] // TODO: Track recent actions
      });
      timings.intentClassificationTime = Date.now() - classificationStart;
      
      this.logger.info('Intent classified', {
        intent: classification.intent,
        confidence: classification.confidence,
        entities: classification.entities.length
      });
      
      // Step 2: Extract context
      const contextStart = Date.now();
      const context = await this.contextExtractor.extractContext(
        query,
        classification,
        workspaceId,
        userId
      );
      const enrichedContext = await this.contextExtractor.enrichContext(
        context,
        classification
      );
      timings.contextExtractionTime = Date.now() - contextStart;
      
      this.logger.info('Context extracted', {
        databases: enrichedContext.databases.length,
        pages: enrichedContext.pages.length,
        entities: enrichedContext.extractedEntities.length
      });
      
      // Step 3: Route query
      const routingStart = Date.now();
      const route = await this.queryRouter.route(
        query,
        classification,
        enrichedContext
      );
      timings.routingTime = Date.now() - routingStart;
      
      this.logger.info('Query routed', {
        routeType: route.primary,
        confidence: route.confidence,
        hasSecondary: !!route.secondary
      });
      
      // Step 4: Execute query
      const executionStart = Date.now();
      const queryResponse = await this.routeHandlers.execute(
        query,
        route,
        workspaceId
      );
      timings.executionTime = Date.now() - executionStart;
      
      this.logger.info('Query executed', {
        responseType: queryResponse.type,
        dataKeys: Object.keys(queryResponse.data),
        processingTime: queryResponse.metadata.processingTime
      });
      
      // Step 5: Generate structured output
      const structuringStart = Date.now();
      const structuredResponse = await this.outputGenerator.generateStructuredOutput(
        query,
        queryResponse,
        {
          classification,
          context: enrichedContext,
          route
        }
      );
      
      // Optimize for rendering
      const optimizedResponse = this.outputGenerator.optimizeForRendering(structuredResponse);
      timings.structuringTime = Date.now() - structuringStart;
      
      this.logger.info('Structured output generated', {
        blocks: optimizedResponse.blocks.length,
        confidence: optimizedResponse.metadata.confidence
      });
      
      // Calculate total time
      timings.totalTime = Date.now() - startTime;
      
      // Check if response time exceeded limit
      if (options.maxResponseTime && timings.totalTime > options.maxResponseTime) {
        this.logger.warn('Response time exceeded limit', {
          limit: options.maxResponseTime,
          actual: timings.totalTime
        });
      }
      
      // Build result
      const result: OrchestrationResult = {
        success: true,
        response: optimizedResponse,
        performance: timings
      };
      
      // Add debug info if requested
      if (options.includeDebug) {
        result.debug = {
          intent: classification.intent,
          confidence: classification.confidence,
          route: route.primary,
          dataSources: optimizedResponse.metadata.dataSources
        };
      }
      
      // Cache successful response
      if (this.cacheConfig.enabled && this.shouldCache(classification, route)) {
        this.cacheResponse(query, workspaceId, result);
      }
      
      // Track metrics
      await this.trackMetrics(query, classification, route, timings, true);
      
      return result;
    } catch (error) {
      this.logger.error('Orchestration failed', error);
      
      // Track failure metrics
      await this.trackMetrics(query, null, null, timings, false);
      
      // Return error response
      return {
        success: false,
        response: {
          blocks: [{
            type: 'text',
            content: 'I encountered an error processing your request. Please try rephrasing your query or contact support if the issue persists.'
          }],
          metadata: {
            confidence: 0,
            dataSources: [],
            suggestions: ['Try simplifying your query', 'Check if the data you\'re looking for exists']
          }
        },
        performance: {
          ...timings,
          totalTime: Date.now() - startTime
        }
      };
    }
  }
  
  /**
   * Process multiple queries in parallel
   */
  async processQueries(
    queries: string[],
    workspaceId: string,
    userId: string
  ): Promise<OrchestrationResult[]> {
    return Promise.all(
      queries.map(query => this.processQuery(query, workspaceId, userId))
    );
  }
  
  /**
   * Get suggestions for a partial query
   */
  async getSuggestions(
    partialQuery: string,
    workspaceId: string,
    userId: string
  ): Promise<string[]> {
    // TODO: Implement query suggestions based on:
    // - Recent queries
    // - Available databases and pages
    // - Common query patterns
    return [];
  }
  
  // Cache management methods
  private getCachedResponse(query: string, workspaceId: string): OrchestrationResult | null {
    const key = this.getCacheKey(query, workspaceId);
    return this.responseCache.get(key) || null;
  }
  
  private cacheResponse(query: string, workspaceId: string, result: OrchestrationResult): void {
    // Check cache size limit
    if (this.responseCache.size >= this.cacheConfig.maxSize) {
      // Remove oldest entry
      const firstKey = this.responseCache.keys().next().value;
      if (firstKey) {
        this.responseCache.delete(firstKey);
      }
    }
    
    const key = this.getCacheKey(query, workspaceId);
    this.responseCache.set(key, result);
    
    // Set TTL for cache expiry
    setTimeout(() => {
      this.responseCache.delete(key);
    }, this.cacheConfig.ttl * 1000);
  }
  
  private getCacheKey(query: string, workspaceId: string): string {
    return `${workspaceId}:${query.toLowerCase().trim()}`;
  }
  
  private shouldCache(classification: any, route: any): boolean {
    // Don't cache action queries
    if (classification.intent === 'action') return false;
    
    // Don't cache real-time queries
    if (route.primary === 'database_query' && 
        classification.entities.some((e: any) => 
          e.value.includes('now') || e.value.includes('current')
        )) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Track metrics for monitoring and optimization
   */
  private async trackMetrics(
    query: string,
    classification: any,
    route: any,
    timings: any,
    success: boolean
  ): Promise<void> {
    try {
      // Log metrics for analysis
      const metrics = {
        query_length: query.length,
        intent: classification?.intent || 'unknown',
        route: route?.primary || 'unknown',
        success,
        ...timings,
        timestamp: new Date().toISOString()
      };
      
      // TODO: Send to analytics service
      this.logger.debug('Metrics tracked', metrics);
    } catch (error) {
      this.logger.error('Failed to track metrics', error);
    }
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.responseCache.clear();
    this.logger.info('Cache cleared');
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    ttl: number;
    enabled: boolean;
  } {
    return {
      size: this.responseCache.size,
      maxSize: this.cacheConfig.maxSize,
      ttl: this.cacheConfig.ttl,
      enabled: this.cacheConfig.enabled
    };
  }
}