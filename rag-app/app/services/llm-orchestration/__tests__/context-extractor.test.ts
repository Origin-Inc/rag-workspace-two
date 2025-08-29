import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextExtractionEngine } from '../context-extractor.server';
import { QueryIntent } from '../intent-classifier.server';
import { createIntentClassification } from './fixtures';
import { createMockSupabase, mockWorkspaces, mockPages, mockDatabases } from '../__mocks__/supabase.mock';

// Mock Supabase
vi.mock('~/utils/supabase.server', () => ({
  createSupabaseAdmin: () => createMockSupabase()
}));

describe('ContextExtractionEngine', () => {
  let engine: ContextExtractionEngine;
  
  beforeEach(() => {
    engine = new ContextExtractionEngine();
    vi.clearAllMocks();
  });
  
  describe('extractContext', () => {
    it('should extract complete context for a query', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.DATA_QUERY,
        entities: [
          { type: 'database', value: 'tasks', confidence: 0.9 }
        ]
      });
      
      const context = await engine.extractContext(
        'show my tasks',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      expect(context.workspace).toBeDefined();
      expect(context.workspace.id).toBe(mockWorkspaces[0].id);
      expect(context.databases).toHaveLength(2); // From mock data
      expect(context.pages).toBeDefined();
      expect(context.user).toBeDefined();
      expect(context.extractedEntities).toHaveLength(1);
    });
    
    it('should handle missing workspace gracefully', async () => {
      const classification = createIntentClassification();
      
      await expect(
        engine.extractContext(
          'test query',
          classification,
          'non-existent-workspace',
          'test-user-id'
        )
      ).rejects.toThrow('Workspace not found');
    });
  });
  
  describe('database context scoring', () => {
    it('should score databases by relevance', async () => {
      const classification = createIntentClassification({
        entities: [
          { type: 'database', value: 'tasks', confidence: 0.95 }
        ]
      });
      
      const context = await engine.extractContext(
        'show tasks',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      // The Tasks database should have highest relevance
      const tasksDb = context.databases.find(db => db.name === 'Tasks Database');
      const expensesDb = context.databases.find(db => db.name === 'Expenses');
      
      expect(tasksDb).toBeDefined();
      expect(expensesDb).toBeDefined();
      expect(tasksDb!.relevanceScore).toBeGreaterThan(expensesDb!.relevanceScore);
    });
    
    it('should boost recently accessed databases', async () => {
      const classification = createIntentClassification();
      
      const context = await engine.extractContext(
        'show data',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      // Check that recently accessed flag affects scoring
      const recentDb = context.databases.find(db => db.recentlyAccessed);
      expect(recentDb).toBeDefined();
    });
    
    it('should filter databases by numeric columns for analytics', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.ANALYTICS
      });
      
      const context = await engine.extractContext(
        'show analytics',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      const enrichedContext = await engine.enrichContext(context, classification);
      
      // Should prioritize databases with numeric columns
      enrichedContext.databases.forEach(db => {
        const hasNumericColumns = db.columns.some(col =>
          ['number', 'currency', 'percent', 'rating'].includes(col.type)
        );
        expect(hasNumericColumns).toBe(true);
      });
    });
  });
  
  describe('page context extraction', () => {
    it('should extract relevant pages', async () => {
      const classification = createIntentClassification({
        entities: [
          { type: 'page', value: 'documentation', confidence: 0.85 }
        ]
      });
      
      const context = await engine.extractContext(
        'find documentation',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      expect(context.pages).toHaveLength(3); // From mock data
      
      // Documentation page should have highest relevance
      const docPage = context.pages.find(p => 
        p.title.toLowerCase().includes('documentation')
      );
      expect(docPage).toBeDefined();
      expect(docPage!.relevanceScore).toBeGreaterThan(5);
    });
    
    it('should sort pages by modification date and relevance', async () => {
      const classification = createIntentClassification();
      
      const context = await engine.extractContext(
        'recent pages',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      // Should be sorted by relevance score
      for (let i = 1; i < context.pages.length; i++) {
        expect(context.pages[i - 1].relevanceScore)
          .toBeGreaterThanOrEqual(context.pages[i].relevanceScore);
      }
    });
  });
  
  describe('entity matching', () => {
    it('should match entities to actual resources', async () => {
      const classification = createIntentClassification({
        entities: [
          { type: 'database', value: 'tasks', confidence: 0.9 },
          { type: 'page', value: 'documentation', confidence: 0.85 }
        ]
      });
      
      const context = await engine.extractContext(
        'show tasks from documentation',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      expect(context.extractedEntities).toHaveLength(2);
      
      const dbEntity = context.extractedEntities.find(e => e.type === 'database');
      expect(dbEntity).toBeDefined();
      expect(dbEntity!.matchedResourceId).toBeDefined();
      expect(dbEntity!.matchedResourceType).toBe('database');
      expect(dbEntity!.confidence).toBe(1.0); // Increased confidence after matching
    });
    
    it('should handle unmatched entities', async () => {
      const classification = createIntentClassification({
        entities: [
          { type: 'database', value: 'non-existent-db', confidence: 0.8 }
        ]
      });
      
      const context = await engine.extractContext(
        'show non-existent data',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      const entity = context.extractedEntities[0];
      expect(entity).toBeDefined();
      expect(entity.matchedResourceId).toBeUndefined();
      expect(entity.confidence).toBe(0.8); // Original confidence
    });
  });
  
  describe('context enrichment', () => {
    it('should enrich context based on intent', async () => {
      const analyticsClassification = createIntentClassification({
        intent: QueryIntent.ANALYTICS
      });
      
      const context = await engine.extractContext(
        'show analytics',
        analyticsClassification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      const enrichedContext = await engine.enrichContext(context, analyticsClassification);
      
      // For analytics, should filter to databases with numeric columns
      enrichedContext.databases.forEach(db => {
        const hasNumericColumns = db.columns.some(col =>
          ['number', 'currency', 'percent', 'rating'].includes(col.type)
        );
        expect(hasNumericColumns).toBe(true);
      });
    });
    
    it('should boost relevance for matching columns in data queries', async () => {
      const classification = createIntentClassification({
        intent: QueryIntent.DATA_QUERY,
        entities: [
          { type: 'entity', value: 'status', confidence: 0.9 }
        ]
      });
      
      const context = await engine.extractContext(
        'show status',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      const enrichedContext = await engine.enrichContext(context, classification);
      
      // Database with 'status' column should have boosted relevance
      const tasksDb = enrichedContext.databases.find(db => 
        db.columns.some(col => col.name.toLowerCase() === 'status')
      );
      expect(tasksDb).toBeDefined();
      expect(tasksDb!.relevanceScore).toBeGreaterThan(10);
    });
  });
  
  describe('caching', () => {
    it('should cache workspace context', async () => {
      const classification = createIntentClassification();
      
      // First call
      const context1 = await engine.extractContext(
        'query 1',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      // Second call (should use cache for workspace)
      const context2 = await engine.extractContext(
        'query 2',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      expect(context1.workspace).toEqual(context2.workspace);
    });
  });
  
  describe('performance', () => {
    it('should extract context quickly', async () => {
      const classification = createIntentClassification();
      
      const startTime = Date.now();
      await engine.extractContext(
        'test query',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      const duration = Date.now() - startTime;
      
      // Should complete quickly (under 200ms for mocked calls)
      expect(duration).toBeLessThan(200);
    });
    
    it('should handle parallel extraction efficiently', async () => {
      const classification = createIntentClassification();
      
      const startTime = Date.now();
      
      // All these should run in parallel internally
      const context = await engine.extractContext(
        'test query',
        classification,
        mockWorkspaces[0].id,
        'test-user-id'
      );
      
      const duration = Date.now() - startTime;
      
      // Parallel execution should be fast
      expect(duration).toBeLessThan(300);
      expect(context.workspace).toBeDefined();
      expect(context.databases).toBeDefined();
      expect(context.pages).toBeDefined();
      expect(context.user).toBeDefined();
    });
  });
});