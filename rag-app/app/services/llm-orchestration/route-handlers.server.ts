import { createSupabaseAdmin } from '~/utils/supabase.server';
import { RAGService } from '../rag.server';
import { DebugLogger } from '~/utils/debug-logger';
import type { RouteDecision, RouteParameters } from './query-router.server';
import { RouteType } from './query-router.server';

// Response types for different routes
export interface QueryResponse {
  type: 'data' | 'content' | 'chart' | 'action' | 'error';
  data: any;
  metadata: {
    source: string;
    confidence: number;
    processingTime: number;
    rowCount?: number;
    tokenCount?: number;
  };
}

export class RouteHandlers {
  private supabase = createSupabaseAdmin();
  private ragService = new RAGService();
  private logger = new DebugLogger('RouteHandlers');
  
  /**
   * Execute query based on route decision
   */
  async execute(
    query: string,
    route: RouteDecision,
    workspaceId: string
  ): Promise<QueryResponse> {
    const startTime = Date.now();
    
    this.logger.info('Executing route', {
      query,
      routeType: route.primary,
      confidence: route.confidence
    });
    
    try {
      let response: QueryResponse;
      
      switch (route.primary) {
        case RouteType.DATABASE_QUERY:
          response = await this.handleDatabaseQuery(query, route.parameters, workspaceId);
          break;
          
        case RouteType.RAG_SEARCH:
          response = await this.handleRAGSearch(query, route.parameters, workspaceId);
          break;
          
        case RouteType.ANALYTICS_AGGREGATION:
          response = await this.handleAnalytics(query, route.parameters, workspaceId);
          break;
          
        case RouteType.HYBRID_SEARCH:
          response = await this.handleHybridSearch(query, route.parameters, workspaceId);
          break;
          
        case RouteType.ACTION_EXECUTION:
          response = await this.handleAction(query, route.parameters, workspaceId);
          break;
          
        case RouteType.DIRECT_RESPONSE:
          response = await this.handleDirectResponse(query, route.parameters);
          break;
          
        default:
          throw new Error(`Unsupported route type: ${route.primary}`);
      }
      
      // Add processing time
      response.metadata.processingTime = Date.now() - startTime;
      
      // If secondary route exists and primary confidence is low, merge results
      if (route.secondary && route.confidence < 0.7) {
        const secondaryRoute = { ...route, primary: route.secondary };
        const secondaryResponse = await this.execute(query, secondaryRoute, workspaceId);
        response = this.mergeResponses(response, secondaryResponse);
      }
      
      return response;
    } catch (error) {
      this.logger.error('Route execution failed', error);
      return {
        type: 'error',
        data: { error: 'Failed to process query', details: error },
        metadata: {
          source: route.primary,
          confidence: 0,
          processingTime: Date.now() - startTime
        }
      };
    }
  }
  
  /**
   * Handle database queries
   */
  private async handleDatabaseQuery(
    query: string,
    params: RouteParameters,
    workspaceId: string
  ): Promise<QueryResponse> {
    if (!params.databaseIds || params.databaseIds.length === 0) {
      throw new Error('No database IDs provided');
    }
    
    // Get database data - using actual Supabase schema
    const { data: databases, error } = await this.supabase
      .from('db_blocks')
      .select('*')
      .in('id', params.databaseIds);
    
    if (error || !databases) {
      throw error || new Error('No databases found');
    }
    
    // Process data based on query
    const results = [];
    let totalRows = 0;
    
    for (const db of databases) {
      const data = db.data as any;
      const rows = data?.rows || [];
      
      // Apply filters if needed (simplified for now)
      const filteredRows = params.limit 
        ? rows.slice(0, params.limit)
        : rows;
      
      results.push({
        databaseId: db.id,
        databaseName: (db.schema as any)?.name || 'Untitled',
        rows: filteredRows,
        columns: (db.schema as any)?.columns || []
      });
      
      totalRows += filteredRows.length;
    }
    
    return {
      type: 'data',
      data: results,
      metadata: {
        source: 'database',
        confidence: 0.95,
        processingTime: 0,
        rowCount: totalRows
      }
    };
  }
  
  /**
   * Handle RAG search
   */
  private async handleRAGSearch(
    query: string,
    params: RouteParameters,
    workspaceId: string
  ): Promise<QueryResponse> {
    const searchQuery = params.searchQuery || query;
    
    // Perform vector search
    const { data: embeddings } = await this.supabase.rpc('search_embeddings', {
      query_embedding: await this.getEmbedding(searchQuery),
      workspace_id: workspaceId,
      limit: params.limit || 10
    });
    
    if (!embeddings || embeddings.length === 0) {
      return {
        type: 'content',
        data: { results: [], message: 'No relevant content found' },
        metadata: {
          source: 'rag',
          confidence: 0.3,
          processingTime: 0
        }
      };
    }
    
    // Build context from results
    const context = await this.ragService.buildAugmentedContext(
      searchQuery,
      embeddings,
      { maxTokens: 3000 }
    );
    
    return {
      type: 'content',
      data: {
        context: context.text,
        citations: context.citations,
        results: embeddings
      },
      metadata: {
        source: 'rag',
        confidence: 0.85,
        processingTime: 0,
        tokenCount: context.totalTokens
      }
    };
  }
  
  /**
   * Handle analytics aggregation
   */
  private async handleAnalytics(
    query: string,
    params: RouteParameters,
    workspaceId: string
  ): Promise<QueryResponse> {
    if (!params.databaseIds || params.databaseIds.length === 0) {
      throw new Error('No databases for analytics');
    }
    
    // Get databases with numeric columns
    const { data: databases } = await this.supabase
      .from('db_blocks')
      .select('*')
      .in('id', params.databaseIds);
    
    if (!databases) {
      throw new Error('Databases not found');
    }
    
    const analytics = [];
    
    for (const db of databases) {
      const schema = db.schema as any;
      const data = db.data as any;
      const rows = data?.rows || [];
      
      // Find numeric columns
      const numericColumns = schema?.columns?.filter((col: any) =>
        ['number', 'currency', 'percent', 'rating'].includes(col.type)
      ) || [];
      
      // Calculate aggregations
      for (const col of numericColumns) {
        const values = rows
          .map((row: any) => row[col.id])
          .filter((val: any) => val != null && !isNaN(val));
        
        if (values.length > 0) {
          const aggregation: any = {
            column: col.name,
            databaseName: schema?.name || 'Untitled',
            count: values.length
          };
          
          if (params.aggregations?.includes('sum')) {
            aggregation.sum = values.reduce((a: number, b: number) => a + b, 0);
          }
          if (params.aggregations?.includes('average')) {
            aggregation.average = aggregation.sum / values.length;
          }
          if (params.aggregations?.includes('min')) {
            aggregation.min = Math.min(...values);
          }
          if (params.aggregations?.includes('max')) {
            aggregation.max = Math.max(...values);
          }
          
          analytics.push(aggregation);
        }
      }
    }
    
    return {
      type: 'chart',
      data: {
        analytics,
        chartType: this.suggestChartType(analytics, query)
      },
      metadata: {
        source: 'analytics',
        confidence: 0.9,
        processingTime: 0,
        rowCount: analytics.length
      }
    };
  }
  
  /**
   * Handle hybrid search (database + RAG)
   */
  private async handleHybridSearch(
    query: string,
    params: RouteParameters,
    workspaceId: string
  ): Promise<QueryResponse> {
    // Execute both database and RAG search in parallel
    const [dbResponse, ragResponse] = await Promise.all([
      params.databaseIds?.length 
        ? this.handleDatabaseQuery(query, params, workspaceId)
        : Promise.resolve(null),
      this.handleRAGSearch(query, params, workspaceId)
    ]);
    
    // Merge results
    return {
      type: 'content',
      data: {
        databases: dbResponse?.data || [],
        content: ragResponse.data,
        merged: true
      },
      metadata: {
        source: 'hybrid',
        confidence: Math.max(
          dbResponse?.metadata.confidence || 0,
          ragResponse.metadata.confidence
        ),
        processingTime: 0,
        rowCount: dbResponse?.metadata.rowCount,
        tokenCount: ragResponse.metadata.tokenCount
      }
    };
  }
  
  /**
   * Handle action execution
   */
  private async handleAction(
    query: string,
    params: RouteParameters,
    workspaceId: string
  ): Promise<QueryResponse> {
    return {
      type: 'action',
      data: {
        actionType: params.actionType,
        message: 'Action execution not yet implemented',
        requiresConfirmation: true
      },
      metadata: {
        source: 'action',
        confidence: 0.8,
        processingTime: 0
      }
    };
  }
  
  /**
   * Handle direct response (no data lookup needed)
   */
  private async handleDirectResponse(
    query: string,
    params: RouteParameters
  ): Promise<QueryResponse> {
    return {
      type: 'content',
      data: {
        message: 'Direct response for help/navigation queries',
        query
      },
      metadata: {
        source: 'direct',
        confidence: 1.0,
        processingTime: 0
      }
    };
  }
  
  /**
   * Get embedding for a query
   */
  private async getEmbedding(text: string): Promise<number[]> {
    // TODO: Implement actual embedding generation
    // For now, return mock embedding
    return Array(1536).fill(0).map(() => Math.random());
  }
  
  /**
   * Suggest chart type based on data
   */
  private suggestChartType(analytics: any[], query: string): string {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('trend') || queryLower.includes('over time')) {
      return 'line';
    }
    if (queryLower.includes('comparison') || queryLower.includes('compare')) {
      return 'bar';
    }
    if (queryLower.includes('distribution') || queryLower.includes('percentage')) {
      return 'pie';
    }
    
    // Default based on data
    if (analytics.length > 5) {
      return 'bar';
    }
    
    return 'table';
  }
  
  /**
   * Merge two responses
   */
  private mergeResponses(
    primary: QueryResponse,
    secondary: QueryResponse
  ): QueryResponse {
    return {
      type: primary.type,
      data: {
        primary: primary.data,
        secondary: secondary.data,
        merged: true
      },
      metadata: {
        source: `${primary.metadata.source}+${secondary.metadata.source}`,
        confidence: (primary.metadata.confidence + secondary.metadata.confidence) / 2,
        processingTime: primary.metadata.processingTime + secondary.metadata.processingTime,
        rowCount: (primary.metadata.rowCount || 0) + (secondary.metadata.rowCount || 0),
        tokenCount: (primary.metadata.tokenCount || 0) + (secondary.metadata.tokenCount || 0)
      }
    };
  }
}