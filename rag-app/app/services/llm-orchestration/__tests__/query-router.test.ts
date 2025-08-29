import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryRouter } from '../query-router.server';
import { QueryIntent, ResponseFormat } from '../intent-classifier.server';
import { createIntentClassification, createQueryContext } from './fixtures';

describe('QueryRouter', () => {
  let router: QueryRouter;
  
  beforeEach(() => {
    router = new QueryRouter();
    vi.clearAllMocks();
  });
  
  describe('route determination', () => {
    it('should route data queries to database handler', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.DATA_QUERY,
        entities: [
          { type: 'database', value: 'tasks', confidence: 0.9 }
        ]
      });
      
      const context = createQueryContext({
        databases: [
          {
            id: 'db-1',
            name: 'Tasks',
            columnCount: 4,
            rowCount: 100,
            columns: [],
            recentlyAccessed: true,
            relevanceScore: 10
          }
        ]
      });
      
      const decision = await router.determineRoute(
        'show my tasks',
        classification,
        context
      );
      
      expect(decision.primary).toBe('database_query');
      expect(decision.confidence).toBeGreaterThan(0.8);
      expect(decision.parameters.databaseIds).toContain('db-1');
    });
    
    it('should route content search to RAG handler', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.CONTENT_SEARCH,
        suggestedFormat: ResponseFormat.TEXT
      });
      
      const context = createQueryContext();
      
      const decision = await router.determineRoute(
        'find documentation',
        classification,
        context
      );
      
      expect(decision.primary).toBe('rag_search');
      expect(decision.parameters.searchStrategy).toBe('semantic');
    });
    
    it('should route analytics queries with numeric requirements', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.ANALYTICS,
        aggregations: ['sum', 'average'],
        timeRange: { relative: 'last month', start: null, end: null }
      });
      
      const context = createQueryContext({
        databases: [
          {
            id: 'db-1',
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
      
      const decision = await router.determineRoute(
        'show expense trends',
        classification,
        context
      );
      
      expect(decision.primary).toBe('analytics_query');
      expect(decision.parameters.aggregations).toContain('sum');
      expect(decision.parameters.timeRange).toBeDefined();
    });
    
    it('should use hybrid route for complex queries', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.SUMMARY,
        entities: [
          { type: 'database', value: 'tasks', confidence: 0.8 },
          { type: 'page', value: 'documentation', confidence: 0.7 }
        ]
      });
      
      const context = createQueryContext({
        databases: [{ id: 'db-1', name: 'Tasks', columnCount: 4, rowCount: 100, columns: [], recentlyAccessed: true, relevanceScore: 8 }],
        pages: [{ id: 'page-1', title: 'Documentation', lastModified: new Date(), blockCount: 50, hasDatabase: false, relevanceScore: 7 }]
      });
      
      const decision = await router.determineRoute(
        'summarize project status',
        classification,
        context
      );
      
      expect(decision.primary).toBe('hybrid_query');
      expect(decision.parameters.sources).toContain('database');
      expect(decision.parameters.sources).toContain('content');
    });
    
    it('should handle action queries appropriately', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.ACTION,
        suggestedFormat: ResponseFormat.ACTION_CONFIRMATION
      });
      
      const context = createQueryContext();
      
      const decision = await router.determineRoute(
        'create new task',
        classification,
        context
      );
      
      expect(decision.primary).toBe('action_handler');
      expect(decision.parameters.requiresConfirmation).toBe(true);
    });
    
    it('should fallback to fallback handler for ambiguous queries', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.AMBIGUOUS,
        confidence: 0.3
      });
      
      const context = createQueryContext();
      
      const decision = await router.determineRoute(
        'stuff',
        classification,
        context
      );
      
      expect(decision.primary).toBe('fallback_handler');
      expect(decision.confidence).toBeLessThan(0.5);
    });
  });
  
  describe('confidence scoring', () => {
    it('should calculate confidence based on entity matches', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.DATA_QUERY,
        confidence: 0.9,
        entities: [
          { type: 'database', value: 'tasks', confidence: 0.95 }
        ]
      });
      
      const context = createQueryContext({
        extractedEntities: [
          {
            type: 'database',
            value: 'tasks',
            matchedResourceId: 'db-1',
            matchedResourceType: 'database',
            confidence: 1.0
          }
        ]
      });
      
      const decision = await router.determineRoute(
        'show tasks',
        classification,
        context
      );
      
      // High confidence due to matched entity
      expect(decision.confidence).toBeGreaterThan(0.9);
    });
    
    it('should lower confidence for unmatched entities', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.DATA_QUERY,
        confidence: 0.9,
        entities: [
          { type: 'database', value: 'unknown', confidence: 0.8 }
        ]
      });
      
      const context = createQueryContext({
        extractedEntities: [
          {
            type: 'database',
            value: 'unknown',
            matchedResourceId: undefined,
            matchedResourceType: undefined,
            confidence: 0.8
          }
        ]
      });
      
      const decision = await router.determineRoute(
        'show unknown data',
        classification,
        context
      );
      
      // Lower confidence due to unmatched entity
      expect(decision.confidence).toBeLessThan(0.8);
    });
  });
  
  describe('parameter extraction', () => {
    it('should extract database IDs for data queries', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.DATA_QUERY
      });
      
      const context = createQueryContext({
        databases: [
          { id: 'db-1', name: 'Tasks', columnCount: 4, rowCount: 100, columns: [], recentlyAccessed: true, relevanceScore: 10 },
          { id: 'db-2', name: 'Projects', columnCount: 3, rowCount: 50, columns: [], recentlyAccessed: false, relevanceScore: 5 }
        ]
      });
      
      const decision = await router.determineRoute(
        'show data',
        classification,
        context
      );
      
      expect(decision.parameters.databaseIds).toContain('db-1');
      expect(decision.parameters.limit).toBeDefined();
    });
    
    it('should extract time range for analytics', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.ANALYTICS,
        timeRange: {
          start: '2024-01-01',
          end: '2024-01-31',
          relative: null
        }
      });
      
      const context = createQueryContext();
      
      const decision = await router.determineRoute(
        'analytics for January',
        classification,
        context
      );
      
      expect(decision.parameters.timeRange).toBeDefined();
      expect(decision.parameters.timeRange.start).toBe('2024-01-01');
      expect(decision.parameters.timeRange.end).toBe('2024-01-31');
    });
    
    it('should include search parameters for content queries', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.CONTENT_SEARCH,
        entities: [
          { type: 'keyword', value: 'authentication', confidence: 0.9 }
        ]
      });
      
      const context = createQueryContext();
      
      const decision = await router.determineRoute(
        'find authentication docs',
        classification,
        context
      );
      
      expect(decision.parameters.searchStrategy).toBe('semantic');
      expect(decision.parameters.maxResults).toBeDefined();
    });
  });
  
  describe('fallback handling', () => {
    it('should provide helpful suggestions for ambiguous queries', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.AMBIGUOUS,
        confidence: 0.3
      });
      
      const context = createQueryContext();
      
      const decision = await router.determineRoute(
        'stuff',
        classification,
        context
      );
      
      expect(decision.primary).toBe('fallback_handler');
      expect(decision.reasoning).toContain('unclear');
    });
    
    it('should suggest clarification for low confidence', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.DATA_QUERY,
        confidence: 0.4
      });
      
      const context = createQueryContext({
        databases: []
      });
      
      const decision = await router.determineRoute(
        'maybe show something',
        classification,
        context
      );
      
      expect(decision.confidence).toBeLessThan(0.5);
      expect(decision.parameters.suggestClarification).toBe(true);
    });
  });
  
  describe('performance', () => {
    it('should route queries quickly', async () => {
      const classification = createIntentClassification();
      const context = createQueryContext();
      
      const startTime = Date.now();
      await router.determineRoute('test query', classification, context);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(50);
    });
    
    it('should handle concurrent routing efficiently', async () => {
      const classification = createIntentClassification();
      const context = createQueryContext();
      
      const queries = Array(10).fill('test query');
      const startTime = Date.now();
      
      const results = await Promise.all(
        queries.map(q => router.determineRoute(q, classification, context))
      );
      
      const duration = Date.now() - startTime;
      
      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(100);
    });
  });
});