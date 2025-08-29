import { DebugLogger } from '~/utils/debug-logger';
import { QueryIntent, type IntentClassification } from './intent-classifier.server';
import type { QueryContext } from './context-extractor.server';

// Query route types
export enum RouteType {
  DATABASE_QUERY = 'database_query',
  RAG_SEARCH = 'rag_search',
  ANALYTICS_AGGREGATION = 'analytics_aggregation',
  HYBRID_SEARCH = 'hybrid_search',
  ACTION_EXECUTION = 'action_execution',
  DIRECT_RESPONSE = 'direct_response'
}

// Route decision with metadata
export interface RouteDecision {
  primary: RouteType;
  secondary?: RouteType;
  confidence: number;
  reasoning: string;
  parameters: RouteParameters;
}

export interface RouteParameters {
  databaseIds?: string[];
  pageIds?: string[];
  searchQuery?: string;
  aggregations?: string[];
  timeRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
  includeRAG?: boolean;
  actionType?: string;
}

export class QueryRouter {
  private logger = new DebugLogger('QueryRouter');
  
  /**
   * Determine the best route for processing a query
   */
  async route(
    query: string,
    classification: IntentClassification,
    context: QueryContext
  ): Promise<RouteDecision> {
    this.logger.info('Routing query', {
      query,
      intent: classification.intent,
      contextDatabases: context.databases.length,
      contextPages: context.pages.length
    });
    
    // Route based on intent
    switch (classification.intent) {
      case QueryIntent.DATA_QUERY:
        return this.routeDataQuery(classification, context);
        
      case QueryIntent.CONTENT_SEARCH:
        return this.routeContentSearch(classification, context);
        
      case QueryIntent.ANALYTICS:
        return this.routeAnalytics(classification, context);
        
      case QueryIntent.SUMMARY:
        return this.routeSummary(classification, context);
        
      case QueryIntent.ACTION:
        return this.routeAction(classification, context);
        
      case QueryIntent.HELP:
      case QueryIntent.NAVIGATION:
        return this.routeDirectResponse(classification, context);
        
      default:
        return this.routeAmbiguous(classification, context);
    }
  }
  
  /**
   * Route data queries to appropriate database
   */
  private routeDataQuery(
    classification: IntentClassification,
    context: QueryContext
  ): RouteDecision {
    const relevantDatabases = context.databases
      .filter(db => db.relevanceScore > 0)
      .slice(0, 3);
    
    if (relevantDatabases.length === 0) {
      // No databases found, try RAG search
      return {
        primary: RouteType.RAG_SEARCH,
        confidence: 0.6,
        reasoning: 'No relevant databases found, falling back to content search',
        parameters: {
          searchQuery: classification.entities.map(e => e.value).join(' '),
          limit: 10
        }
      };
    }
    
    return {
      primary: RouteType.DATABASE_QUERY,
      secondary: RouteType.RAG_SEARCH,
      confidence: Math.min(relevantDatabases[0].relevanceScore / 10, 1.0),
      reasoning: `Found ${relevantDatabases.length} relevant database(s)`,
      parameters: {
        databaseIds: relevantDatabases.map(db => db.id),
        includeRAG: relevantDatabases[0].relevanceScore < 5,
        limit: 100
      }
    };
  }
  
  /**
   * Route content search queries
   */
  private routeContentSearch(
    classification: IntentClassification,
    context: QueryContext
  ): RouteDecision {
    const relevantPages = context.pages
      .filter(p => p.relevanceScore > 0);
    
    return {
      primary: RouteType.RAG_SEARCH,
      confidence: 0.9,
      reasoning: 'Content search query detected',
      parameters: {
        searchQuery: classification.entities.map(e => e.value).join(' '),
        pageIds: relevantPages.map(p => p.id),
        limit: 20
      }
    };
  }
  
  /**
   * Route analytics queries
   */
  private routeAnalytics(
    classification: IntentClassification,
    context: QueryContext
  ): RouteDecision {
    const analyticsDbases = context.databases
      .filter(db => 
        db.columns.some(col => 
          ['number', 'currency', 'percent', 'rating', 'date'].includes(col.type)
        )
      );
    
    if (analyticsDbases.length === 0) {
      return {
        primary: RouteType.DIRECT_RESPONSE,
        confidence: 0.5,
        reasoning: 'No databases with numeric data found for analytics',
        parameters: {}
      };
    }
    
    return {
      primary: RouteType.ANALYTICS_AGGREGATION,
      confidence: 0.85,
      reasoning: `Found ${analyticsDbases.length} database(s) with numeric data`,
      parameters: {
        databaseIds: analyticsDbases.map(db => db.id),
        aggregations: classification.aggregations || ['sum', 'average', 'count'],
        timeRange: this.extractTimeRange(classification)
      }
    };
  }
  
  /**
   * Route summary queries
   */
  private routeSummary(
    classification: IntentClassification,
    context: QueryContext
  ): RouteDecision {
    // Determine if summary is for data or content
    const hasDataContext = context.databases.some(db => db.relevanceScore > 5);
    const hasContentContext = context.pages.some(p => p.relevanceScore > 5);
    
    if (hasDataContext && !hasContentContext) {
      return {
        primary: RouteType.DATABASE_QUERY,
        confidence: 0.8,
        reasoning: 'Summary request for database data',
        parameters: {
          databaseIds: context.databases
            .filter(db => db.relevanceScore > 5)
            .map(db => db.id),
          aggregations: ['count', 'sum'],
          limit: 50
        }
      };
    }
    
    if (hasContentContext || (!hasDataContext && !hasContentContext)) {
      return {
        primary: RouteType.HYBRID_SEARCH,
        confidence: 0.75,
        reasoning: 'Summary request requiring both data and content',
        parameters: {
          searchQuery: classification.entities.map(e => e.value).join(' '),
          databaseIds: context.databases.map(db => db.id),
          pageIds: context.pages.map(p => p.id),
          limit: 30
        }
      };
    }
    
    return {
      primary: RouteType.RAG_SEARCH,
      confidence: 0.7,
      reasoning: 'General summary request',
      parameters: {
        searchQuery: classification.entities.map(e => e.value).join(' '),
        limit: 20
      }
    };
  }
  
  /**
   * Route action queries
   */
  private routeAction(
    classification: IntentClassification,
    context: QueryContext
  ): RouteDecision {
    return {
      primary: RouteType.ACTION_EXECUTION,
      confidence: 0.9,
      reasoning: 'Action request detected',
      parameters: {
        actionType: this.detectActionType(classification),
        databaseIds: context.extractedEntities
          .filter(e => e.matchedResourceType === 'database')
          .map(e => e.matchedResourceId!)
      }
    };
  }
  
  /**
   * Route direct response queries
   */
  private routeDirectResponse(
    classification: IntentClassification,
    context: QueryContext
  ): RouteDecision {
    return {
      primary: RouteType.DIRECT_RESPONSE,
      confidence: 0.95,
      reasoning: 'Query can be answered directly without data lookup',
      parameters: {}
    };
  }
  
  /**
   * Route ambiguous queries using hybrid approach
   */
  private routeAmbiguous(
    classification: IntentClassification,
    context: QueryContext
  ): RouteDecision {
    return {
      primary: RouteType.HYBRID_SEARCH,
      confidence: 0.5,
      reasoning: 'Ambiguous query, using hybrid search approach',
      parameters: {
        searchQuery: classification.entities.map(e => e.value).join(' '),
        databaseIds: context.databases.slice(0, 2).map(db => db.id),
        pageIds: context.pages.slice(0, 3).map(p => p.id),
        includeRAG: true,
        limit: 25
      }
    };
  }
  
  /**
   * Extract time range from classification
   */
  private extractTimeRange(classification: IntentClassification): { start: Date; end: Date } | undefined {
    if (!classification.timeRange) return undefined;
    
    const now = new Date();
    let start = now;
    let end = now;
    
    if (classification.timeRange.relative) {
      const relative = classification.timeRange.relative.toLowerCase();
      
      if (relative.includes('last month')) {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
      } else if (relative.includes('this month')) {
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = now;
      } else if (relative.includes('last week')) {
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        end = now;
      }
    }
    
    if (classification.timeRange.start) {
      start = new Date(classification.timeRange.start);
    }
    if (classification.timeRange.end) {
      end = new Date(classification.timeRange.end);
    }
    
    return { start, end };
  }
  
  /**
   * Detect action type from classification
   */
  private detectActionType(classification: IntentClassification): string {
    const query = classification.entities.map(e => e.value).join(' ').toLowerCase();
    
    if (query.includes('create') || query.includes('add') || query.includes('new')) {
      return 'create';
    }
    if (query.includes('update') || query.includes('edit') || query.includes('change')) {
      return 'update';
    }
    if (query.includes('delete') || query.includes('remove')) {
      return 'delete';
    }
    
    return 'unknown';
  }
}