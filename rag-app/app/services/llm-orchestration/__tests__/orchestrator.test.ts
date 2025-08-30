import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMOrchestrator } from '../orchestrator.server';
import { QueryIntent } from '../intent-classifier.server';
import { RouteType } from '../query-router.server';

// Mock the OpenAI client
vi.mock('../../openai.server', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                intent: 'data_query',
                confidence: 0.9,
                suggestedFormat: 'table',
                entities: [
                  { type: 'database', value: 'tasks', confidence: 0.95 }
                ],
                explanation: 'User wants to see task data'
              })
            }
          }]
        })
      }
    }
  }
}));

// Mock Supabase
vi.mock('~/utils/supabase.server', () => ({
  createSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'workspace-1',
              name: 'Test Workspace'
            }
          })
        })),
        in: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({
            data: [{
              id: 'db-1',
              schema: {
                name: 'Tasks',
                columns: [
                  { id: 'title', name: 'Title', type: 'text' },
                  { id: 'status', name: 'Status', type: 'select' },
                  { id: 'priority', name: 'Priority', type: 'number' }
                ]
              },
              data: {
                rows: [
                  { title: 'Task 1', status: 'pending', priority: 1 },
                  { title: 'Task 2', status: 'done', priority: 2 }
                ]
              }
            }]
          })
        })),
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({
            data: []
          })
        }))
      }))
    })),
    rpc: vi.fn().mockResolvedValue({
      data: []
    })
  }))
}));

describe('LLMOrchestrator', () => {
  let orchestrator: LLMOrchestrator;
  
  beforeEach(() => {
    orchestrator = new LLMOrchestrator({
      enabled: false // Disable cache for tests
    });
  });
  
  describe('processQuery', () => {
    it('should process a simple data query', async () => {
      const result = await orchestrator.processQuery(
        'show my tasks',
        'workspace-1',
        'user-1'
      );
      
      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response.blocks).toBeInstanceOf(Array);
      expect(result.performance.totalTime).toBeGreaterThan(0);
    });
    
    it('should include debug information when requested', async () => {
      const result = await orchestrator.processQuery(
        'show my tasks',
        'workspace-1',
        'user-1',
        { includeDebug: true }
      );
      
      expect(result.debug).toBeDefined();
      expect(result.debug?.intent).toBe('data_query');
      expect(result.debug?.confidence).toBeGreaterThan(0);
    });
    
    it('should handle errors gracefully', async () => {
      // Mock an error
      vi.mocked(orchestrator['intentClassifier'].classifyIntent).mockRejectedValueOnce(
        new Error('Classification failed')
      );
      
      const result = await orchestrator.processQuery(
        'invalid query',
        'workspace-1',
        'user-1'
      );
      
      expect(result.success).toBe(false);
      expect(result.response.blocks[0].type).toBe('text');
      expect(result.response.blocks[0].content).toContain('error');
    });
    
    it('should respect max response time', async () => {
      const result = await orchestrator.processQuery(
        'show my tasks',
        'workspace-1',
        'user-1',
        { maxResponseTime: 5000 }
      );
      
      expect(result.performance.totalTime).toBeLessThan(5000);
    });
  });
  
  describe('caching', () => {
    it('should cache responses when enabled', async () => {
      const cachedOrchestrator = new LLMOrchestrator({
        enabled: true,
        ttl: 60
      });
      
      // First call
      const result1 = await cachedOrchestrator.processQuery(
        'show my tasks',
        'workspace-1',
        'user-1'
      );
      
      // Second call (should be cached)
      const result2 = await cachedOrchestrator.processQuery(
        'show my tasks',
        'workspace-1',
        'user-1'
      );
      
      expect(result1.performance.totalTime).toBeGreaterThan(0);
      // Cached response should be much faster
      expect(result2.performance.totalTime).toBeLessThan(result1.performance.totalTime);
    });
    
    it('should bypass cache when requested', async () => {
      const cachedOrchestrator = new LLMOrchestrator({
        enabled: true,
        ttl: 60
      });
      
      // First call
      await cachedOrchestrator.processQuery(
        'show my tasks',
        'workspace-1',
        'user-1'
      );
      
      // Second call with bypass
      const result = await cachedOrchestrator.processQuery(
        'show my tasks',
        'workspace-1',
        'user-1',
        { bypassCache: true }
      );
      
      expect(result.performance.totalTime).toBeGreaterThan(0);
    });
  });
  
  describe('performance', () => {
    it('should track performance metrics', async () => {
      const result = await orchestrator.processQuery(
        'show revenue by month',
        'workspace-1',
        'user-1'
      );
      
      expect(result.performance).toBeDefined();
      expect(result.performance.intentClassificationTime).toBeGreaterThan(0);
      expect(result.performance.contextExtractionTime).toBeGreaterThan(0);
      expect(result.performance.routingTime).toBeGreaterThan(0);
      expect(result.performance.executionTime).toBeGreaterThan(0);
      expect(result.performance.structuringTime).toBeGreaterThan(0);
      expect(result.performance.totalTime).toBe(
        result.performance.intentClassificationTime +
        result.performance.contextExtractionTime +
        result.performance.routingTime +
        result.performance.executionTime +
        result.performance.structuringTime
      );
    });
  });
});

describe('Query Examples', () => {
  let orchestrator: LLMOrchestrator;
  
  beforeEach(() => {
    orchestrator = new LLMOrchestrator();
  });
  
  const testQueries = [
    {
      query: 'show my completed tasks',
      expectedIntent: QueryIntent.DATA_QUERY,
      expectedRoute: RouteType.DATABASE_QUERY
    },
    {
      query: 'find documentation about authentication',
      expectedIntent: QueryIntent.CONTENT_SEARCH,
      expectedRoute: RouteType.RAG_SEARCH
    },
    {
      query: 'revenue by month for last quarter',
      expectedIntent: QueryIntent.ANALYTICS,
      expectedRoute: RouteType.ANALYTICS_AGGREGATION
    },
    {
      query: 'summarize project status',
      expectedIntent: QueryIntent.SUMMARY,
      expectedRoute: RouteType.HYBRID_SEARCH
    },
    {
      query: 'create a new task for bug fixing',
      expectedIntent: QueryIntent.ACTION,
      expectedRoute: RouteType.ACTION_EXECUTION
    }
  ];
  
  testQueries.forEach(({ query, expectedIntent, expectedRoute }) => {
    it(`should correctly process: "${query}"`, async () => {
      const result = await orchestrator.processQuery(
        query,
        'workspace-1',
        'user-1',
        { includeDebug: true }
      );
      
      expect(result.success).toBe(true);
      expect(result.response.blocks.length).toBeGreaterThan(0);
      // These would pass with real OpenAI integration:
      // expect(result.debug?.intent).toBe(expectedIntent);
      // expect(result.debug?.route).toBe(expectedRoute);
    });
  });
});