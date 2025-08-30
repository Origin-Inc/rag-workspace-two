import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RouteHandlers } from '../route-handlers.server';
import { createRouteDecision, createQueryContext } from './fixtures';
import { createMockSupabase, mockDatabaseRows, mockEmbeddings } from '../__mocks__/supabase.mock';

// Mock dependencies
vi.mock('~/utils/supabase.server', () => ({
  createSupabaseAdmin: () => createMockSupabase()
}));

vi.mock('../../rag.server', () => ({
  RAGService: class {
    async searchSimilar(query: string, workspaceId: string, options: any) {
      return mockEmbeddings;
    }
    
    async buildAugmentedContext(query: string, results: any[]) {
      return {
        text: 'Augmented context from embeddings',
        citations: results.map(r => ({
          source: r.metadata?.page || 'Unknown',
          relevance: r.similarity
        })),
        totalTokens: 100
      };
    }
  }
}));

describe('RouteHandlers', () => {
  let handlers: RouteHandlers;
  
  beforeEach(() => {
    handlers = new RouteHandlers();
    vi.clearAllMocks();
  });
  
  describe('handleDatabaseQuery', () => {
    it('should query database and return results', async () => {
      const decision = createRouteDecision({
        primary: 'database_query',
        parameters: {
          databaseIds: ['db-1'],
          filters: { status: 'pending' },
          limit: 10
        }
      });
      
      const context = createQueryContext({
        databases: [
          {
            id: 'db-1',
            name: 'Tasks',
            columnCount: 4,
            rowCount: 100,
            columns: [
              { name: 'title', type: 'text' },
              { name: 'status', type: 'select' }
            ],
            recentlyAccessed: true,
            relevanceScore: 10
          }
        ]
      });
      
      const response = await handlers.handleDatabaseQuery(
        'show pending tasks',
        decision,
        context
      );
      
      expect(response.type).toBe('data');
      expect(response.data).toBeDefined();
      expect(response.metadata.source).toBe('database');
      expect(response.metadata.databaseId).toBe('db-1');
    });
    
    it('should handle empty results gracefully', async () => {
      const decision = createRouteDecision({
        parameters: {
          databaseIds: ['empty-db'],
          limit: 10
        }
      });
      
      const context = createQueryContext({
        databases: []
      });
      
      const response = await handlers.handleDatabaseQuery(
        'show data from empty database',
        decision,
        context
      );
      
      expect(response.type).toBe('data');
      expect(response.data.results).toEqual([]);
      expect(response.metadata.rowCount).toBe(0);
    });
    
    it('should apply filters correctly', async () => {
      const decision = createRouteDecision({
        parameters: {
          databaseIds: ['db-1'],
          filters: {
            status: 'done',
            priority: { operator: '>', value: 2 }
          }
        }
      });
      
      const context = createQueryContext();
      
      const response = await handlers.handleDatabaseQuery(
        'show completed high priority tasks',
        decision,
        context
      );
      
      expect(response.type).toBe('data');
      expect(response.metadata.filtersApplied).toBeTruthy();
    });
  });
  
  describe('handleRAGSearch', () => {
    it('should perform semantic search', async () => {
      const decision = createRouteDecision({
        primary: 'rag_search',
        parameters: {
          searchStrategy: 'semantic',
          maxResults: 5
        }
      });
      
      const context = createQueryContext();
      
      const response = await handlers.handleRAGSearch(
        'find authentication documentation',
        decision,
        context
      );
      
      expect(response.type).toBe('content');
      expect(response.data.content).toBeDefined();
      expect(response.data.citations).toBeInstanceOf(Array);
      expect(response.metadata.source).toBe('rag');
    });
    
    it('should include citations from search results', async () => {
      const decision = createRouteDecision({
        parameters: {
          searchStrategy: 'semantic'
        }
      });
      
      const context = createQueryContext();
      
      const response = await handlers.handleRAGSearch(
        'search query',
        decision,
        context
      );
      
      expect(response.data.citations).toHaveLength(mockEmbeddings.length);
      expect(response.data.citations[0]).toHaveProperty('source');
      expect(response.data.citations[0]).toHaveProperty('relevance');
    });
  });
  
  describe('handleAnalyticsQuery', () => {
    it('should perform analytics calculations', async () => {
      const decision = createRouteDecision({
        primary: 'analytics_query',
        parameters: {
          databaseIds: ['db-2'],
          aggregations: ['sum', 'average'],
          timeRange: { relative: 'last month' }
        }
      });
      
      const context = createQueryContext({
        databases: [
          {
            id: 'db-2',
            name: 'Expenses',
            columnCount: 4,
            rowCount: 100,
            columns: [
              { name: 'amount', type: 'currency' },
              { name: 'date', type: 'date' }
            ],
            recentlyAccessed: false,
            relevanceScore: 8
          }
        ]
      });
      
      const response = await handlers.handleAnalyticsQuery(
        'show expense analytics',
        decision,
        context
      );
      
      expect(response.type).toBe('analytics');
      expect(response.data.metrics).toBeDefined();
      expect(response.data.chartData).toBeDefined();
      expect(response.metadata.source).toBe('analytics');
    });
    
    it('should calculate multiple aggregations', async () => {
      const decision = createRouteDecision({
        parameters: {
          databaseIds: ['db-2'],
          aggregations: ['sum', 'average', 'min', 'max'],
          groupBy: 'category'
        }
      });
      
      const context = createQueryContext();
      
      const response = await handlers.handleAnalyticsQuery(
        'expense breakdown by category',
        decision,
        context
      );
      
      expect(response.data.metrics).toHaveProperty('sum');
      expect(response.data.metrics).toHaveProperty('average');
      expect(response.data.metrics).toHaveProperty('min');
      expect(response.data.metrics).toHaveProperty('max');
    });
  });
  
  describe('handleHybridQuery', () => {
    it('should combine database and content results', async () => {
      const decision = createRouteDecision({
        primary: 'hybrid_query',
        parameters: {
          sources: ['database', 'content'],
          databaseIds: ['db-1']
        }
      });
      
      const context = createQueryContext();
      
      const response = await handlers.handleHybridQuery(
        'summarize project including tasks and docs',
        decision,
        context
      );
      
      expect(response.type).toBe('hybrid');
      expect(response.data).toHaveProperty('databaseResults');
      expect(response.data).toHaveProperty('contentResults');
      expect(response.metadata.sources).toContain('database');
      expect(response.metadata.sources).toContain('content');
    });
    
    it('should merge results intelligently', async () => {
      const decision = createRouteDecision({
        parameters: {
          sources: ['database', 'content', 'analytics']
        }
      });
      
      const context = createQueryContext();
      
      const response = await handlers.handleHybridQuery(
        'complete overview',
        decision,
        context
      );
      
      expect(response.type).toBe('hybrid');
      expect(response.data.summary).toBeDefined();
      expect(response.metadata.mergeStrategy).toBeDefined();
    });
  });
  
  describe('handleActionQuery', () => {
    it('should prepare action confirmation', async () => {
      const decision = createRouteDecision({
        primary: 'action_handler',
        parameters: {
          actionType: 'create',
          targetResource: 'task',
          requiresConfirmation: true
        }
      });
      
      const context = createQueryContext();
      
      const response = await handlers.handleActionQuery(
        'create new task',
        decision,
        context
      );
      
      expect(response.type).toBe('action');
      expect(response.data.requiresConfirmation).toBe(true);
      expect(response.data.actionDescription).toBeDefined();
      expect(response.metadata.actionType).toBe('create');
    });
    
    it('should validate action permissions', async () => {
      const decision = createRouteDecision({
        parameters: {
          actionType: 'delete',
          targetResource: 'database',
          requiresConfirmation: true
        }
      });
      
      const context = createQueryContext({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          role: 'viewer', // No delete permissions
          recentDatabases: [],
          recentPages: [],
          preferences: {}
        }
      });
      
      const response = await handlers.handleActionQuery(
        'delete database',
        decision,
        context
      );
      
      expect(response.type).toBe('action');
      expect(response.data.permissionDenied).toBe(true);
      expect(response.data.reason).toContain('permission');
    });
  });
  
  describe('handleFallback', () => {
    it('should provide helpful suggestions', async () => {
      const decision = createRouteDecision({
        primary: 'fallback_handler',
        confidence: 0.3,
        parameters: {
          suggestClarification: true
        }
      });
      
      const context = createQueryContext();
      
      const response = await handlers.handleFallback(
        'stuff',
        decision,
        context
      );
      
      expect(response.type).toBe('fallback');
      expect(response.data.suggestions).toBeInstanceOf(Array);
      expect(response.data.suggestions.length).toBeGreaterThan(0);
      expect(response.metadata.confidence).toBeLessThan(0.5);
    });
    
    it('should include available actions', async () => {
      const decision = createRouteDecision({
        primary: 'fallback_handler'
      });
      
      const context = createQueryContext({
        databases: [
          { id: 'db-1', name: 'Tasks', columnCount: 4, rowCount: 100, columns: [], recentlyAccessed: true, relevanceScore: 5 }
        ],
        pages: [
          { id: 'page-1', title: 'Docs', lastModified: new Date(), blockCount: 50, hasDatabase: false, relevanceScore: 3 }
        ]
      });
      
      const response = await handlers.handleFallback(
        'unclear query',
        decision,
        context
      );
      
      expect(response.data.availableResources).toBeDefined();
      expect(response.data.availableResources.databases).toHaveLength(1);
      expect(response.data.availableResources.pages).toHaveLength(1);
    });
  });
  
  describe('error handling', () => {
    it('should handle database query errors gracefully', async () => {
      const decision = createRouteDecision({
        parameters: {
          databaseIds: ['error-db']
        }
      });
      
      const context = createQueryContext();
      
      // Mock an error scenario
      vi.mock('~/utils/supabase.server', () => ({
        createSupabaseAdmin: () => ({
          from: () => {
            throw new Error('Database connection failed');
          }
        })
      }));
      
      const response = await handlers.handleDatabaseQuery(
        'query that will fail',
        decision,
        context
      );
      
      expect(response.type).toBe('error');
      expect(response.metadata.error).toBeDefined();
    });
  });
  
  describe('performance', () => {
    it('should handle queries within performance limits', async () => {
      const decision = createRouteDecision();
      const context = createQueryContext();
      
      const startTime = Date.now();
      
      await handlers.handleDatabaseQuery('test', decision, context);
      
      const duration = Date.now() - startTime;
      
      // Should complete quickly for mocked data
      expect(duration).toBeLessThan(100);
    });
    
    it('should handle parallel route execution', async () => {
      const decision = createRouteDecision();
      const context = createQueryContext();
      
      const startTime = Date.now();
      
      const results = await Promise.all([
        handlers.handleDatabaseQuery('q1', decision, context),
        handlers.handleRAGSearch('q2', decision, context),
        handlers.handleAnalyticsQuery('q3', decision, context)
      ]);
      
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(3);
      expect(duration).toBeLessThan(200);
    });
  });
});